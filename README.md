# Simulador de Flota — Gasoducto Virtual (GNC)

Herramienta web simple y visual para estimar **cuántos jumbos (semirremolques de tubos de gas comprimido) y cuántos tractores** hacen falta para abastecer una demanda diaria de gas a un punto de consumo (p. ej. un set de fractura), desde una estación de carga ubicada a cierta distancia.

Compara dos políticas operativas y permite analizar la sensibilidad a la distancia.

## Qué calcula

- **Desenganche permitido (drop-and-hook):** el tractor deja el jumbo y engancha otro ya cargado; no espera la carga ni la descarga. Menos tractores, más jumbos en juego.
- **Desenganche NO permitido (tractor atado):** el tractor permanece con su jumbo durante toda la carga y descarga. El número de tractores iguala al de jumbos.

Para cada política muestra: nº de jumbos, nº de tractores, utilización de la estación, ciclo (h) y viajes/día, además de un esquema animado y un gráfico de sensibilidad **70 km vs 170 km**.

## Modelo (resumen)

Dimensionamiento determinístico por ciclo (ley de Little):

```
n   = Demanda / Capacidad_jumbo          (viajes/día)
t_L = Capacidad / (Nameplate / Surtidores)   carga
t_u = Capacidad / Tasa_descarga              descarga
t_tr= Distancia / Velocidad                  viaje (una vía)

Inventario en flujo: I = n/H · (t_L + t_u + 2·t_tr + 2·maniobra)

Con desenganche:   jumbos = ⌈I + staging⌉ + spare ;  tractores = ⌈n·(2·t_tr+2·maniobra)/H⌉ + spare
Sin desenganche:   jumbos = tractores = ⌈n·(t_L+t_u+2·t_tr+2·maniobra)/H⌉ + spare
```

Los resultados representan el **piso mínimo factible**; se recomienda agregar spare y, antes de comprometer capital, validar con un análisis de variabilidad (Monte-Carlo), sobre todo en distancias largas.

## Uso

Abrir `index.html` en cualquier navegador. No requiere build ni dependencias.

Todos los parámetros son editables (sliders + campos numéricos). El estado se puede compartir por URL con **«Copiar enlace de este escenario»** (deep-link por query params). Hay vista **Imprimir / PDF** para exportar al deck.

## Despliegue (GitHub Pages)

Sitio 100 % estático; se sirve directamente desde la rama `main` (raíz). El archivo `.nojekyll` evita el procesamiento Jekyll.

## Licencia

MIT — ver `LICENSE`.
