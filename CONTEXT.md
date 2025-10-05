# Contexto del Proyecto

## Objetivo Principal
Sistema de análisis de planos de edificios para mejorar evacuaciones y prevenir complicaciones en emergencias, con el fin de salvar vidas.

## Flujo de Trabajo

1. **Entrada**: PDF con planos de edificio
2. **Procesamiento**: Evaluación del PDF usando API de Gemini
3. **Conversión**: Transformación a formato JSON
4. **Visualización**: Renderizado 3D del "piso" de cada planta
5. **Análisis**: Pathfinding para optimizar rutas de evacuación

## Tecnologías
- API de Gemini (configurada en `.env`)
- Visualizador 3D
- Sistema de pathfinding

## Estado Actual
Trabajando en la parte de evaluación de PDF y conversión a JSON para alimentar el visualizador 3D.
