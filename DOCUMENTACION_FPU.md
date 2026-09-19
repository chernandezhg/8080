# Integracion conceptual de un coprocesador de punto flotante

## 1. Objetivo

El Intel 8080 trabaja nativamente con enteros de 8 bits y no incluye una unidad de punto flotante. Esta ampliacion modela un dispositivo externo especializado: la CPU envia operandos y comandos mediante puertos de salida (`OUT`) y recupera el resultado y estado mediante puertos de entrada (`IN`).

La implementacion no altera las instrucciones historicas del procesador. Aprovecha el mecanismo de entrada/salida que ya forma parte de su arquitectura para representar conceptualmente la comunicacion con un coprocesador.

## 2. Arquitectura

```text
Programa ensamblador
       |
       | OUT 10H-18H
       v
+---------------------------+
| FPU Float32                |
| F0 + F1 + comando          |
| ADD / SUB / MUL / DIV      |
| RESULT + STATUS            |
+---------------------------+
       |
       | IN 20H-24H
       v
CPU Intel 8080 / memoria RAM
```

Cada numero ocupa cuatro bytes en orden little-endian. Se usa `DataView` para convertir entre los bytes transferidos por el 8080 y el valor IEEE 754; `Math.fround` fuerza el resultado a precision de 32 bits.

## 3. Comandos y estado

### Comandos enviados a `18H`

| Valor | Operacion |
|---|---|
| `00H` | Reiniciar FPU |
| `01H` | Sumar `F0 + F1` |
| `02H` | Restar `F0 - F1` |
| `03H` | Multiplicar `F0 * F1` |
| `04H` | Dividir `F0 / F1` |

### Bits leidos desde `24H`

| Bit | Mascara | Significado |
|---|---|---|
| 0 | `01H` | Resultado disponible (`READY`) |
| 1 | `02H` | Division entre cero |
| 2 | `04H` | Desbordamiento (`OVERFLOW`) |
| 3 | `08H` | Subdesbordamiento (`UNDERFLOW`) |
| 4 | `10H` | Operacion o resultado invalido |

## 4. Demostracion incluida

El boton **Cargar demostracion IN/OUT** inserta y ensambla un programa completo. El programa:

1. Envia `1.5`, cuyos bits son `3FC00000H`, a los puertos `10H`–`13H`.
2. Envia `2.25`, cuyos bits son `40100000H`, a los puertos `14H`–`17H`.
3. Envia el comando de suma `01H` al puerto `18H`.
4. Lee el resultado desde `20H`–`23H`.
5. Guarda los bytes en `2000H`–`2003H`.
6. Lee el estado desde `24H` y lo guarda en `2004H`.

El resultado esperado es `3.75`, representado como `40700000H`, con estado `01H` (`READY`).

## 5. Verificacion

Ejecutar:

```bash
node test.js
```

La suite verifica:

- Registros, banderas y ensamblador original.
- Suma Float32 y representacion IEEE 754.
- Deteccion de division entre cero.
- Programa ensamblado que usa `OUT`, ejecuta la FPU, usa `IN` y almacena el resultado en RAM.

