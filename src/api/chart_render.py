"""Helpers de renderizado para los endpoints /charts/images/*.png.

Genera visualizaciones analíticas estáticas con seaborn/matplotlib del lado
del servidor (histogramas, heatmaps, boxenplots) para preguntas que no se
responden bien con los gráficos interactivos de Tremor (distribuciones,
concentración temporal). No reemplaza esos gráficos, los complementa.
"""

import io
import logging

import matplotlib
matplotlib.use("Agg")  # backend sin display, requerido para renderizar en el servidor

import matplotlib.pyplot as plt
import seaborn as sns
from fastapi import HTTPException
from fastapi.responses import Response

sns.set_theme(style="white")

logger = logging.getLogger(__name__)

# Paleta tomada 1:1 de frontend/app/globals.css (--surface, --border, --text,
# --muted, --primary) y frontend/lib/format.ts (estadoStyle) — para que las
# imágenes estáticas se vean como parte del mismo dashboard, no un injerto.
THEMES = {
    "dark": {
        "bg": "#1A1F2E",
        "text": "#F1F5F9",
        "muted": "#94A3B8",
        "grid": "#2A3040",
        "primary": "#3B82F6",
    },
    "light": {
        "bg": "#FFFFFF",
        "text": "#0F172A",
        "muted": "#64748B",
        "grid": "#E2E8F0",
        "primary": "#1D4ED8",
    },
}

# NOTA: estadoStyle() en frontend/lib/format.ts mapea Activo/Liquidado/
# Terminado/Suspendido, pero esos valores no existen en los datos reales de
# SECOP (ver `SELECT DISTINCT estado FROM contracts` — son "En ejecución",
# "Cerrado", "Modificado", "terminado" en minúscula, etc.). Ese descalce es
# un bug preexistente del dashboard interactivo (casi todo cae en el color
# por defecto) que no toca este cambio; este mapeo usa los valores reales
# para que el boxenplot sí distinga estados. Orden fijo, nunca ciclado.
ESTADO_COLORS = {
    "En ejecución": "#3B82F6",
    "Cerrado": "#94A3B8",
    "Modificado": "#6366F1",
    "terminado": "#64748B",
    "Aprobado": "#10B981",
    "cedido": "#F59E0B",
    "Suspendido": "#EF4444",
    "Borrador": "#CBD5E1",
    "Prorrogado": "#14B8A6",
}
ESTADO_DEFAULT_COLOR = "#94A3B8"

MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

# Cota defensiva: más allá de esto, se muestrea en SQL (TABLESAMPLE) en vez de
# traer todas las filas — evita bloquear la API con queries de cientos de
# miles de valores para un histograma que no necesita esa resolución.
MAX_DISTRIBUTION_ROWS = 150_000


def get_theme(theme: str | None) -> dict:
    return THEMES.get(theme or "dark", THEMES["dark"])


def abbr_cop(value: float) -> str:
    """Equivalente Python de fmtAbbr() en frontend/lib/format.ts, para los
    ejes de las gráficas."""
    v = abs(value)
    sign = "-" if value < 0 else ""
    if v >= 1e12:
        return f"{sign}${v / 1e12:.2f} B"
    if v >= 1e9:
        return f"{sign}${v / 1e9:,.0f} MM"
    if v >= 1e6:
        return f"{sign}${v / 1e6:,.0f} M"
    return f"{sign}${v:,.0f}"


def style_figure(fig, ax_list, colors: dict) -> None:
    """Aplica la paleta del dashboard a los ejes: fondo, ticks, spines y
    grid recesivo (ver dataviz skill — grid/axes discretos, nunca protagonistas)."""
    fig.patch.set_facecolor(colors["bg"])
    for ax in ax_list:
        ax.set_facecolor(colors["bg"])
        ax.tick_params(colors=colors["muted"], labelsize=9.5)
        for spine in ("top", "right"):
            ax.spines[spine].set_visible(False)
        for spine in ("left", "bottom"):
            ax.spines[spine].set_color(colors["grid"])
        ax.xaxis.label.set_color(colors["muted"])
        ax.yaxis.label.set_color(colors["muted"])
        ax.title.set_color(colors["text"])
        for label in ax.get_xticklabels() + ax.get_yticklabels():
            label.set_color(colors["muted"])


def render_png(fig, colors: dict, extra_headers: dict | None = None) -> Response:
    buf = io.BytesIO()
    try:
        fig.savefig(
            buf, format="png", dpi=150, facecolor=colors["bg"],
            bbox_inches="tight", pad_inches=0.35,
        )
    finally:
        plt.close(fig)
    buf.seek(0)
    headers = {
        # 30 min de cache — estas imágenes cambian a lo sumo una vez al día
        # (corrida del ETL), no hay razón para regenerarlas en cada request.
        "Cache-Control": "public, max-age=1800",
    }
    if extra_headers:
        headers.update(extra_headers)
    return Response(content=buf.getvalue(), media_type="image/png", headers=headers)


def render_error_placeholder(mensaje: str, colors: dict) -> Response:
    """Fallback visual si seaborn/matplotlib falla: una imagen PNG simple con
    el mensaje, en vez de un JSON que rompería un <img> del frontend. Queda
    marcada con X-Chart-Error para que sea detectable desde monitoreo aunque
    el <img> la renderice sin problema (status 200 con contenido válido)."""
    fig, ax = plt.subplots(figsize=(6, 3))
    fig.patch.set_facecolor(colors["bg"])
    ax.set_facecolor(colors["bg"])
    ax.axis("off")
    ax.text(
        0.5, 0.5, f"No se pudo generar la gráfica\n({mensaje})",
        ha="center", va="center", fontsize=11, color=colors["muted"], wrap=True,
    )
    return render_png(fig, colors, extra_headers={
        "Cache-Control": "no-store", "X-Chart-Error": "true",
    })


def safe_render(render_fn, colors: dict) -> Response:
    """Envuelve un render_fn() en manejo de errores: si seaborn/matplotlib
    falla, la API igual responde 200 con un PNG de fallback visible en el
    <img> del frontend, en vez de romper la página con un error genérico.

    HTTPException se re-lanza tal cual (ej. 404 por entidad inexistente):
    eso es un error de request del cliente, no una falla de renderizado,
    y el frontend debe poder distinguirlos.
    """
    try:
        return render_fn()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Fallo generando gráfica de imagen: %s", exc)
        return render_error_placeholder(f"{type(exc).__name__}", colors)
