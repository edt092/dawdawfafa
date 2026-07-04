"""Adaptador de extracción: SECOP II via API SODA (datos.gov.co).

Dataset: "SECOP II - Contratos Electrónicos"
Endpoint: https://www.datos.gov.co/resource/jbjy-vk9h.json

Documentación SODA: https://dev.socrata.com/consumers/getting-started.html
"""

import logging
import os
import random
import time
from datetime import datetime
from typing import TYPE_CHECKING, Iterator

import requests

from src.extract.base import BaseExtractor

if TYPE_CHECKING:
    from src.error_log import PipelineErrorLog

logger = logging.getLogger(__name__)

ENDPOINT = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
PAGE_SIZE = 1000
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "7"))
BACKOFF_SECONDS = float(os.getenv("BACKOFF_SECONDS", "5"))
MAX_BACKOFF_SECONDS = float(os.getenv("MAX_BACKOFF_SECONDS", "120"))
REQUEST_TIMEOUT = 60
PAGE_DELAY = float(os.getenv("PAGE_DELAY", "0.3"))  # configurable vía env


class SecopExtractionError(RuntimeError):
    """Se agotaron los reintentos contra la API de Socrata.

    Se lanza en vez de devolver una página vacía para que un caído total
    del feed no se confunda con "no hay más páginas" y el pipeline falle
    de forma explícita en lugar de terminar silenciosamente con pocos
    registros.
    """


def _strip_z(ts: str | None) -> str | None:
    """Socrata devuelve :updated_at con sufijo 'Z' (ej. '...863Z'); lo quitamos
    para poder reinyectar el mismo valor tal cual en un $where de SoQL."""
    if ts and ts.endswith("Z"):
        return ts[:-1]
    return ts


class SecopSocrataExtractor(BaseExtractor):
    SOURCE_NAME = "SECOP_SOCRATA"

    def __init__(
        self,
        app_token: str | None = None,
        max_records: int | None = None,
        date_from: str | None = None,
        since_updated_at: datetime | str | None = None,
        since_id: str | None = None,
        error_log: "PipelineErrorLog | None" = None,
    ):
        self._app_token = app_token or os.getenv("SOCRATA_APP_TOKEN")
        self._max_records = max_records
        self._date_from = date_from or os.getenv("DATE_FROM")
        # Cursor incremental compuesto (:updated_at, :id). Se acepta datetime u
        # str para no obligar al llamador a formatear (ver pipeline.py, que lo
        # arma tanto desde el cursor nuevo -str- como desde el legado -datetime-).
        if isinstance(since_updated_at, datetime):
            since_updated_at = since_updated_at.strftime("%Y-%m-%dT%H:%M:%S")
        self._since_updated_at = since_updated_at
        self._since_id = since_id
        self._error_log = error_log

    def _build_headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self._app_token:
            headers["X-App-Token"] = self._app_token
        return headers

    @staticmethod
    def _compute_backoff(attempt: int, retry_after: str | None) -> float:
        """Backoff exponencial con jitter; respeta Retry-After si el servidor lo envía."""
        if retry_after:
            try:
                return float(retry_after)
            except ValueError:
                pass
        base = min(BACKOFF_SECONDS * (2 ** (attempt - 1)), MAX_BACKOFF_SECONDS)
        return base + random.uniform(0, base * 0.25)

    def _build_where(self, cursor_updated_at: str | None, cursor_id: str | None) -> str | None:
        conditions = []
        if cursor_updated_at:
            if cursor_id:
                # Cursor compuesto: cuando la fuente hace un bulk update, miles/millones
                # de filas comparten el mismo :updated_at. Filtrar solo por fecha
                # (">=") reprocesa toda esa ventana en cada corrida; con ':id' como
                # desempate avanzamos exactamente por donde quedó la corrida anterior,
                # tanto entre páginas de una misma corrida como entre corridas.
                conditions.append(
                    f"(:updated_at > '{cursor_updated_at}' OR "
                    f"(:updated_at = '{cursor_updated_at}' AND :id > '{cursor_id}'))"
                )
            else:
                # Bootstrap: solo tenemos fecha (cursor legado o primera corrida
                # incremental tras este cambio), todavía sin ':id' de desempate.
                conditions.append(f":updated_at >= '{cursor_updated_at}'")
        if self._date_from:
            # Filtro manual por fecha de firma (backfill o carga inicial acotada)
            conditions.append(f"fecha_de_firma >= '{self._date_from}'")
        return " AND ".join(conditions) if conditions else None

    def preflight(self) -> int | None:
        """Cuenta liviana de registros pendientes desde el cursor actual, sin
        descargar ni procesar nada. Si la fuente no publicó cambios (total=0),
        el pipeline puede terminar en segundos en vez de re-extraer y re-cargar
        millones de filas ya vistas. Retorna None si la consulta falla — en ese
        caso el pipeline sigue con la corrida completa como si no supiéramos."""
        where = self._build_where(self._since_updated_at, self._since_id)
        params = {"$select": "count(*) as total"}
        if where:
            params["$where"] = where
        try:
            resp = requests.get(
                ENDPOINT, headers=self._build_headers(), params=params, timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            logger.warning("Preflight falló, se continúa con la corrida completa: %s", exc)
            return None
        return int(data[0]["total"]) if data else 0

    def _fetch_page(self, cursor_updated_at: str | None, cursor_id: str | None) -> list[dict]:
        last_exc: Exception | None = None
        params = {
            "$limit": PAGE_SIZE,
            "$select": (
                ":id,"
                ":updated_at,"
                "nombre_entidad,"
                "proveedor_adjudicado,"
                "valor_del_contrato,"
                "fecha_de_firma,"
                "estado_contrato,"
                "proceso_de_compra,"
                "documento_proveedor,"
                "nit_entidad"
            ),
            "$order": ":updated_at ASC, :id ASC",
        }
        where = self._build_where(cursor_updated_at, cursor_id)
        if where:
            params["$where"] = where

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.get(
                    ENDPOINT,
                    headers=self._build_headers(),
                    params=params,
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                last_exc = exc
                logger.warning(
                    "Intento %d/%d fallido (cursor=%s/%s, where=%s): %s",
                    attempt, MAX_RETRIES, cursor_updated_at, cursor_id, where, exc,
                )
                if attempt < MAX_RETRIES:
                    retry_after = None
                    if exc.response is not None:
                        retry_after = exc.response.headers.get("Retry-After")
                    time.sleep(self._compute_backoff(attempt, retry_after))
        msg = f"Se agotaron los reintentos en cursor={cursor_updated_at}/{cursor_id} (where={where}): {last_exc}"
        logger.error(msg)
        if self._error_log:
            self._error_log.log("Extracción — API", msg)
        raise SecopExtractionError(msg) from last_exc

    def extract(self) -> Iterator[dict]:
        cursor_updated_at = self._since_updated_at
        cursor_id = self._since_id
        total_yielded = 0

        logger.info("Iniciando extracción SECOP Socrata (endpoint=%s)", ENDPOINT)

        while True:
            page = self._fetch_page(cursor_updated_at, cursor_id)
            if not page:
                break

            for raw in page:
                yield self._normalize_raw(raw)
                total_yielded += 1
                if self._max_records and total_yielded >= self._max_records:
                    logger.info("Límite de registros alcanzado (%d).", self._max_records)
                    return

            last = page[-1]
            cursor_updated_at = _strip_z(last.get(":updated_at")) or cursor_updated_at
            cursor_id = last.get(":id") or cursor_id
            logger.debug("Página procesada (cursor=%s/%s, registros=%d)", cursor_updated_at, cursor_id, len(page))

            if len(page) < PAGE_SIZE:
                break  # última página
            time.sleep(PAGE_DELAY)

        logger.info("Extracción finalizada: %d registros extraídos.", total_yielded)

    @staticmethod
    def _normalize_raw(raw: dict) -> dict:
        """Mapea los campos Socrata a la interfaz interna del pipeline."""
        return {
            "entidad": (raw.get("nombre_entidad") or "").strip(),
            "contratista": (raw.get("proveedor_adjudicado") or "").strip(),
            "valor": raw.get("valor_del_contrato"),
            "fecha": raw.get("fecha_de_firma"),
            "estado": (raw.get("estado_contrato") or "").strip(),
            "identificacion_proveedor": (raw.get("documento_proveedor") or "").strip(),
            "proceso_de_compra": (raw.get("proceso_de_compra") or "").strip(),
            "fuente": SecopSocrataExtractor.SOURCE_NAME,
            "_raw": raw,  # payload original para rejected_records
            "_updated_at": _strip_z(raw.get(":updated_at")),  # cursor incremental compuesto
            "_id": raw.get(":id"),  # desempate del cursor cuando :updated_at se repite en bulk
        }
