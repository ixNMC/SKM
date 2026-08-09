# SKM
SKMProject
# SKMTOUCH

SKMTOUCH es una aplicación interactiva orientada al diseño y modelado, con soporte tanto para una versión de escritorio (Python/PyQt/Tkinter) como para una nueva versión web basada en **Flask** y **Fabric.js**.

## Estructura del Proyecto

La aplicación se divide en dos entornos principales. Para la **versión web**, los archivos fundamentales que hacen que funcione son los siguientes:

### 1. Backend (Servidor Web)
- `app.py`: Es el punto de entrada de la aplicación web. Utiliza **Flask** para levantar el servidor local y servir los archivos HTML, CSS y JS, además de exponer la API (`/api/guardar`, `/api/cargar`).

### 2. Frontend (Interfaz de Usuario)
- `templates/index.html`: Define la estructura básica de la página web, los paneles, el *Dock* de herramientas y carga las librerías necesarias (como *Fabric.js*).
- `static/css/styles.css`: Contiene todos los estilos visuales de la aplicación web, incluyendo las animaciones, el modo oscuro, y la presentación del *Dock* flotante.
- `static/js/main.js`: Es el corazón lógico del frontend. Gestiona el lienzo interactivo (*Canvas*), la creación de figuras, la lógica avanzada de edición de nodos, bifurcaciones, selecciones múltiples y las peticiones al servidor.

### Otros archivos (Versión de escritorio / Core)
Adicionalmente, el proyecto cuenta con archivos de la versión original de escritorio o módulos en desarrollo:
- `main.py` / `standard_window.py` / `Schemas.py` / `align_tools.py`: Lógica y estructura de la versión de escritorio de la aplicación.
- Scripts de soporte (ej. `fix.py`, `fix_anchor.py`, etc.): Scripts temporales utilizados durante el desarrollo para aplicar parches de código.

---

## Instrucciones de Instalación y Uso (Versión Web)

### Requisitos Previos
- Tener instalado **Python 3.x**.
- Tener instalada la librería **Flask**. Si no la tienes, puedes instalarla ejecutando:
  ```bash
  pip install Flask
  ```

### Ejecutar la Aplicación
1. Abre un terminal o consola de comandos.
2. Navega hasta el directorio raíz del proyecto (`SKMTOUCH`).
3. Ejecuta el archivo principal del servidor:
   ```bash
   python app.py
   ```
4. El servidor se iniciará. Podrás acceder a la aplicación desde cualquier navegador:
   - **Localmente (en el mismo equipo):** Entra en `http://127.0.0.1:5000` o `http://localhost:5000`
   - **Desde otro dispositivo en la red (ej. móvil o tablet):** Entra en `http://<IP_DE_TU_EQUIPO>:5000` (Ejemplo: `http://192.168.1.50:5000`)

---

## Funcionalidades Principales de la Web App
- Creación paramétrica de polilíneas, rectángulos, círculos, elipses y triángulos.
- **Modo de Edición de Nodos:** Manipulación avanzada de vértices, creación de nuevos nodos haciendo clic en los bordes y borrado de los mismos.
- **Selección Múltiple de Nodos:** Capacidad de arrastrar un recuadro de selección para coger múltiples nodos y moverlos o borrarlos en bloque de forma consistente.
- Sistema inteligente de anclaje (*Snapping* geométrico) para vincular vértices con otros objetos.
- Herramientas de texto enriquecido y control de propiedades visuales (color de fondo, bordes, opacidad, grosor).
- Sistema de **Historial** completo (Deshacer/Rehacer).
- Lienzo de dimensiones dinámicas con capacidad de paneo (*Pan*) y zoom.
