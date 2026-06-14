# Simulador de Flota — Gasoducto Virtual (GNC)

Herramienta web simple y visual para estimar **cuántos jumbos (semirremolques de tubos de gas comprimido) y cuántos tractores** hacen falta para abastecer una demanda diaria de gas a un punto de consumo (p. ej. un set de fractura), desde una estación de carga ubicada a cierta distancia.

Compara dos políticas operativas y permite analizar la sensibilidad a la distancia.

## Qué calcula

- **Desenganche permitido (drop-and-hook):** el tractor deja el jumbo y engancha otro; no espera la carga ni la alimentación del set. Menos tractores; el resto del tiempo los jumbos trabajan sin tractor.
- **Desenganche NO permitido (tractor atado):** el tractor permanece con su jumbo durante la carga y mientras alimenta el set. El número de tractores iguala al de jumbos.

**El número de jumbos es el mismo en ambas políticas** (el gas se carga, transporta y consume igual); el desenganche solo cambia el número de **tractores**.

Para cada política muestra: nº de jumbos, nº de tractores, utilización de la estación, ciclo (h) y viajes/día, además de un esquema animado y un gráfico de sensibilidad **70 km vs 170 km**.

## Modelo (resumen)

Dimensionamiento determinístico por ciclo (ley de Little). En el set hay siempre ~`jumbos_en_set` (p. ej. 2) en simultáneo para garantizar el suministro, en ambas políticas; eso fija la residencia en el set:

```
n     = Demanda / Capacidad_jumbo            (viajes/día)
t_L   = Capacidad / (Nameplate / Surtidores)   carga
t_tr  = Distancia / Velocidad                  viaje (una vía)
w_set = jumbos_en_set · H / n                  residencia en el set (ley de Little)

Jumbos (ambas políticas):
  jumbos = ⌈ n/H · (t_L + 2·t_tr + 2·maniobra) + jumbos_en_set ⌉ + spare

Tractores:
  con desenganche:  ⌈ n·(2·t_tr + 2·maniobra)/H ⌉ + spare
  sin desenganche:  = jumbos   (ciclo del rig = t_L + w_set + 2·t_tr + 2·maniobra)
```

Los resultados representan el **piso mínimo factible**; se recomienda agregar spare y, antes de comprometer capital, validar con un análisis de variabilidad (Monte-Carlo), sobre todo en distancias largas.

## Uso

Abrir `index.html` en cualquier navegador. No requiere build ni dependencias.

Todos los parámetros son editables (sliders + campos numéricos). El estado se puede compartir por URL con **«Copiar enlace de este escenario»** (deep-link por query params). Hay vista **Imprimir / PDF** para exportar al deck.

## Despliegue (GitHub Pages)

Sitio 100 % estático; se sirve directamente desde la rama `main` (raíz). El archivo `.nojekyll` evita el procesamiento Jekyll.

## Licencia

MIT — ver `LICENSE`.
