"""GET /api/reports — reportes Excel/PDF de entidad y contratista (plan Pro)."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from src.api.deps import get_db, require_pro
from src.api.reports import (
    build_pdf, build_workbook, contractor_report_data, entity_report_data, safe_filename,
)
from src.load.models import PremiumUser

router = APIRouter(prefix="/reports", tags=["reports"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MIME = "application/pdf"


def _attachment(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/entity/{nombre}.xlsx")
def entity_report_xlsx(
    nombre: str, user: PremiumUser = Depends(require_pro), db: Session = Depends(get_db),
) -> Response:
    data = entity_report_data(db, nombre)
    buf = build_workbook(data)
    return _attachment(buf.read(), XLSX_MIME, f"reporte_entidad_{safe_filename(nombre)}.xlsx")


@router.get("/entity/{nombre}.pdf")
def entity_report_pdf(
    nombre: str, user: PremiumUser = Depends(require_pro), db: Session = Depends(get_db),
) -> Response:
    data = entity_report_data(db, nombre)
    buf = build_pdf(data)
    return _attachment(buf.read(), PDF_MIME, f"reporte_entidad_{safe_filename(nombre)}.pdf")


@router.get("/contractor/{nombre}.xlsx")
def contractor_report_xlsx(
    nombre: str, user: PremiumUser = Depends(require_pro), db: Session = Depends(get_db),
) -> Response:
    data = contractor_report_data(db, nombre)
    buf = build_workbook(data)
    return _attachment(buf.read(), XLSX_MIME, f"reporte_contratista_{safe_filename(nombre)}.xlsx")


@router.get("/contractor/{nombre}.pdf")
def contractor_report_pdf(
    nombre: str, user: PremiumUser = Depends(require_pro), db: Session = Depends(get_db),
) -> Response:
    data = contractor_report_data(db, nombre)
    buf = build_pdf(data)
    return _attachment(buf.read(), PDF_MIME, f"reporte_contratista_{safe_filename(nombre)}.pdf")
