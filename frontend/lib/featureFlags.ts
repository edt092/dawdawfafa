// Funcionalidades premium (alertas guardadas, monitor de competidores,
// reportes, plan Pro) pausadas: estamos integrando pagos con Wompi y su API
// todavía no está aprobada. Mientras tanto, ningún botón/link/página premium
// debe ser visible ni alcanzable para usuarios que lleguen a contratadata.xyz.
//
// El código de estas features sigue completo (componentes, backend,
// endpoints) — esto solo controla si se montan en la UI. Cambiar a `true`
// cuando Wompi apruebe la integración para reactivar todo de una vez.
export const PREMIUM_ENABLED = false
