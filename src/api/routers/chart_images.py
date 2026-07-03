"""GET /api/charts/images/*.png — visualizaciones analíticas estáticas
(seaborn/matplotlib), complementarias a los gráficos interactivos de Tremor
en /api/charts. Cada endpoint responde una pregunta puntual que un gráfico
interactivo simple no responde bien (distribución, concentración temporal,
dispersión por categoría)."""

from datetime import date
from statistics import median
from typing import Optional

import pandas as pd
import seaborn as sns
from fastapi import APIRouter, Depends, HTTPException, Query
from matplotlib.ticker import FuncFormatter
import matplotlib.pyplot as plt
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from src.api.chart_render import (
    ESTADO_COLORS, ESTADO_DEFAULT_COLOR, MAX_DISTRIBUTION_ROWS, MESES_ES,
    abbr_cop, get_theme, render_png, safe_render, style_figure,
)
from src.api.deps import get_db
from src.load.models import Contract, Entity

router = APIRouter(prefix="/charts/images", tags=["charts-images"])


@router.get("/monthly-heatmap.png")
def monthly_heatmap(
    entidad: Optional[str] = Query(None),
    theme: str = Query("dark"),
    db: Session = Depends(get_db),
):
    colors = get_theme(theme)

    entity_id = None
    if entidad:
        entity = db.execute(select(Entity).where(Entity.nombre_canonico == entidad)).scalars().first()
        if not entity:
            raise HTTPException(status_code=404, detail="Entidad no encontrada")
        entity_id = entity.id

    def _render():
        stmt = (
            select(
                extract("year", Contract.fecha).label("anio"),
                extract("month", Contract.fecha).label("mes"),
                func.count(Contract.id).label("cantidad"),
            )
            .group_by("anio", "mes")
            .order_by("anio", "mes")
        )
        if entity_id is not None:
            stmt = stmt.where(Contract.entity_id == entity_id)

        rows = db.execute(stmt).all()
        if not rows:
            raise ValueError("sin datos para graficar")

        df = pd.DataFrame(rows, columns=["anio", "mes", "cantidad"])
        df["anio"] = df["anio"].astype(int)
        df["mes"] = df["mes"].astype(int)

        pivot = (
            df.pivot(index="anio", columns="mes", values="cantidad")
            .reindex(columns=range(1, 13))
            .fillna(0)
        )
        pivot.columns = [MESES_ES[m - 1] for m in pivot.columns]

        fig, ax = plt.subplots(figsize=(9, max(2.6, 0.45 * len(pivot) + 1)))
        cmap = sns.light_palette(colors["primary"], as_cmap=True)
        sns.heatmap(
            pivot, ax=ax, cmap=cmap, linewidths=1, linecolor=colors["bg"],
            cbar_kws={"label": "Contratos"},
        )
        titulo = "Concentración mensual de contratación"
        if entidad:
            titulo += f" — {entidad}"
        ax.set_title(titulo, fontsize=13, fontweight="bold", pad=14, color=colors["text"])
        ax.set_xlabel("")
        ax.set_ylabel("")
        style_figure(fig, [ax], colors)

        cbar = ax.collections[0].colorbar
        cbar.ax.yaxis.label.set_color(colors["muted"])
        cbar.ax.tick_params(colors=colors["muted"])

        return render_png(fig, colors)

    return safe_render(_render, colors)


@router.get("/value-distribution.png")
def value_distribution(
    entidad: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    desde: Optional[date] = Query(None),
    hasta: Optional[date] = Query(None),
    theme: str = Query("dark"),
    db: Session = Depends(get_db),
):
    colors = get_theme(theme)

    def _render():
        base = select(Contract.valor).where(Contract.valor > 0)
        if entidad:
            base = base.join(Entity, Contract.entity_id == Entity.id).where(
                Entity.nombre_canonico == entidad
            )
        if estado:
            base = base.where(Contract.estado == estado)
        if desde:
            base = base.where(Contract.fecha >= desde)
        if hasta:
            base = base.where(Contract.fecha <= hasta)

        total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
        if total == 0:
            raise ValueError("sin contratos para los filtros seleccionados")

        # Cota defensiva simple (no muestreo aleatorio): un LIMIT evita traer
        # cientos de miles de valores para un histograma que no necesita esa
        # resolución, sin la complejidad de TABLESAMPLE combinado con joins.
        values = [float(v) for v in db.execute(base.limit(MAX_DISTRIBUTION_ROWS)).scalars().all()]

        fig, ax = plt.subplots(figsize=(8, 4.5))
        sns.histplot(x=values, log_scale=True, ax=ax, color=colors["primary"], edgecolor=colors["bg"])

        mediana = median(values)
        ax.axvline(mediana, color=colors["muted"], linestyle="--", linewidth=1.3)
        ax.text(
            mediana, ax.get_ylim()[1] * 0.96, f" mediana {abbr_cop(mediana)}",
            color=colors["muted"], fontsize=9, va="top",
        )

        titulo = "Distribución de valores de contratos (escala log)"
        if entidad:
            titulo += f" — {entidad}"
        ax.set_title(titulo, fontsize=13, fontweight="bold", pad=14, color=colors["text"])
        ax.set_xlabel("Valor del contrato (COP)")
        ax.set_ylabel("Cantidad de contratos")
        ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: abbr_cop(x)))
        style_figure(fig, [ax], colors)

        nota = f"n = {len(values):,}"
        if total > MAX_DISTRIBUTION_ROWS:
            nota += f" (muestra de {total:,})"
        ax.text(0.995, -0.16, nota, transform=ax.transAxes, ha="right", fontsize=8.5, color=colors["muted"])

        return render_png(fig, colors)

    return safe_render(_render, colors)


@router.get("/entity-boxenplot.png")
def entity_boxenplot(
    entidad: str = Query(...),
    theme: str = Query("dark"),
    db: Session = Depends(get_db),
):
    colors = get_theme(theme)

    entity = db.execute(select(Entity).where(Entity.nombre_canonico == entidad)).scalars().first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    def _render():
        rows = db.execute(
            select(Contract.estado, Contract.valor)
            .where(Contract.entity_id == entity.id, Contract.valor > 0)
            .limit(20_000)
        ).all()
        if not rows:
            raise ValueError("la entidad no tiene contratos con valor positivo")

        df = pd.DataFrame(rows, columns=["estado", "valor"])
        df["estado"] = df["estado"].fillna("Sin estado")
        df["valor"] = df["valor"].astype(float)

        order = df.groupby("estado")["valor"].median().sort_values(ascending=False).index.tolist()
        palette = [ESTADO_COLORS.get(e, ESTADO_DEFAULT_COLOR) for e in order]

        fig, ax = plt.subplots(figsize=(8, max(3.4, 0.6 * len(order) + 1.8)))
        sns.boxenplot(
            data=df, x="valor", y="estado", order=order,
            hue="estado", hue_order=order, palette=palette, legend=False,
            ax=ax,
        )
        ax.set_xscale("log")
        ax.set_title(
            f"Distribución de valores por estado — {entidad}",
            fontsize=13, fontweight="bold", pad=14, color=colors["text"],
        )
        ax.set_xlabel("Valor del contrato (COP, escala log)")
        ax.set_ylabel("")
        ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: abbr_cop(x)))
        style_figure(fig, [ax], colors)

        return render_png(fig, colors)

    return safe_render(_render, colors)
