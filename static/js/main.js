// ==========================================
// static/js/main.js - Lógica de Interfaz Tactil
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Utilidad para generar IDs únicos
    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    // 1. INICIALIZAR FABRIC.JS
    const contenedorCanvas = document.getElementById('canvas-container');
    const canvas = new fabric.Canvas('lienzoSchemas', {
        width: contenedorCanvas ? contenedorCanvas.clientWidth : window.innerWidth * 0.9,
        height: contenedorCanvas ? contenedorCanvas.clientHeight : window.innerHeight * 0.9,
        selection: true, 
        selectionFullyContained: true, // FASE 8: Solo selecciona si la figura está 100% dentro del recuadro
        uniScaleTransform: false, // 1.2 No obligar a mantener la proporción al redimensionar
        preserveObjectStacking: true // FASE 9: Mantener el Z-index estricto, para que la figura no tape su texto al ser seleccionada
    });

    // 1.1 Configuración Global de Controles de FabricJS (Cuadrados huecos y pequeños)
    fabric.Object.prototype.transparentCorners = true;
    fabric.Object.prototype.cornerColor = 'transparent';
    fabric.Object.prototype.cornerStrokeColor = '#0B4A85'; // Color azul oscuro para bordes
    fabric.Object.prototype.cornerSize = 10;
    fabric.Object.prototype.padding = 5;

    // 1.3 Personalizar el control de rotación (mtr) para que sea un círculo
    if (fabric.Object.prototype.controls && fabric.Object.prototype.controls.mtr) {
        const mtrControl = fabric.Object.prototype.controls.mtr;
        mtrControl.render = function(ctx, left, top, styleOverride, fabricObject) {
            styleOverride = styleOverride || {};
            ctx.save();
            ctx.beginPath();
            ctx.arc(left, top, (styleOverride.cornerSize || fabricObject.cornerSize) / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = styleOverride.cornerColor || fabricObject.cornerColor || 'transparent';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = styleOverride.cornerStrokeColor || fabricObject.cornerStrokeColor || '#0B4A85';
            ctx.stroke();
            ctx.restore();
        };
    }

    // Estado global de la aplicación (¿Qué herramienta está activa?)
    let modoActual = 'seleccion';

    // FASE 6: Variables y Estilos para las Líneas Guía de Ortogonalidad
    let guideLineH = null;
    let guideLineV = null;
    const GUIDE_COLOR = '#1F81F9';
    const GUIDE_ACTIVE_COLOR = '#D90429';
    const GUIDE_DASH = [5, 5];
    const GUIDE_WIDTH = 1;
    const GUIDE_ACTIVE_WIDTH = 3;

    // Variables de estado para el Modo Línea
    let puntosLinea = [];
    let polilineaActiva = null;
    let lineaStartLinkTemp = null;
    let lineaEndLinkTemp = null;
    const btnFinalizarLinea = document.getElementById('btn-finalizar-linea');

    // Función para finalizar y consolidar la línea actual
    function finalizarLinea() {
        if (polilineaActiva) {
            polilineaActiva.set({
                selectable: true,
                evented: true,
                startNodeLink: lineaStartLinkTemp,
                endNodeLink: lineaEndLinkTemp
            });
            delete polilineaActiva.isDrawing; // Ya no está dibujándose
            
            // FASE 4 y 5: Aplicar el snapping geométrico perfecto si hay vínculos
            if (lineaStartLinkTemp) {
                if (lineaStartLinkTemp.pointId) {
                    actualizarNodoVinculado(polilineaActiva, 0, lineaStartLinkTemp);
                } else {
                    let obj = canvas.getObjects().find(o => o.id === lineaStartLinkTemp);
                    if (obj) actualizarNodoVinculado(polilineaActiva, 0, obj);
                }
            }
            if (lineaEndLinkTemp) {
                if (lineaEndLinkTemp.pointId) {
                    actualizarNodoVinculado(polilineaActiva, polilineaActiva.points.length - 1, lineaEndLinkTemp);
                } else {
                    let obj = canvas.getObjects().find(o => o.id === lineaEndLinkTemp);
                    if (obj) actualizarNodoVinculado(polilineaActiva, polilineaActiva.points.length - 1, obj);
                }
            }
            
            // Hacemos que sea el objeto activo tras terminar de dibujarlo
            canvas.setActiveObject(polilineaActiva);
            canvas.renderAll();
            saveHistory(); // Guardar historial tras terminar la línea completa
        }
        puntosLinea = [];
        polilineaActiva = null;
        lineaStartLinkTemp = null;
        lineaEndLinkTemp = null;
        btnFinalizarLinea.classList.add('hidden');
    }

    // Evento para el botón de finalizar línea
    btnFinalizarLinea.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        finalizarLinea();
    });

    // 2. ADAPTAR A CAMBIOS DE PANTALLA
    window.addEventListener('resize', () => {
        if (contenedorCanvas) {
            canvas.setWidth(contenedorCanvas.clientWidth);
            canvas.setHeight(contenedorCanvas.clientHeight);
        } else {
            canvas.setWidth(window.innerWidth * 0.9);
            canvas.setHeight(window.innerHeight * 0.9);
        }
        canvas.renderAll();
    });

    // ==========================================
    // DIBUJO Y EVENTOS EN EL LIENZO (CANVAS)
    // ==========================================

    canvas.on('mouse:down', function(opciones) {
        // FASE 9: Modo Texto
        if (modoActual === 'texto') {
            if (opciones.target && opciones.target.type !== 'polyline' && opciones.target.type !== 'activeSelection' && opciones.target.type !== 'textbox') {
                iniciarEdicionTexto(opciones.target);
            }
            // Habilitamos Pan potencial si pinchamos en vacío
            if (!opciones.target) {
                isPotentialPan = true;
                dragStartX = opciones.e.clientX || (opciones.e.touches && opciones.e.touches[0].clientX);
                dragStartY = opciones.e.clientY || (opciones.e.touches && opciones.e.touches[0].clientY);
            }
            return;
        }

        // FASE 10: Iniciar Panning (Herramienta Mano, tecla Espacio, o clic central)
        if (modoActual === 'mano' || isSpacePressed || (opciones.e && opciones.e.button === 1)) {
            isPanning = true;
            canvas.selection = false;
            lastPosX = opciones.e.clientX || (opciones.e.touches && opciones.e.touches[0].clientX);
            lastPosY = opciones.e.clientY || (opciones.e.touches && opciones.e.touches[0].clientY);
            return; // Bloqueamos el resto de lógicas
        }

        // Solo actuamos si el modo NO es 'seleccion' ni 'mano'
        if (modoActual === 'seleccion' || modoActual === 'mano') return;

        if (opciones.target && opciones.target === canvas.getActiveObject()) return;
        if (opciones.target && modoActual !== 'linea') return;

        // FASE 12 Mejora: Auto-Pan vs Selección Múltiple de Nodos
        if (!opciones.target) {
            if (isEditingNodes && isMultiNodeSelectActive) {
                isMultiNodeSelectDrag = true;
                const pointer = canvas.getPointer(opciones.e);
                nodeSelectStartX = pointer.x;
                nodeSelectStartY = pointer.y;
                nodeSelectRect = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 0,
                    height: 0,
                    fill: 'rgba(0, 150, 255, 0.1)',
                    stroke: 'rgba(0, 150, 255, 0.8)',
                    strokeWidth: 1,
                    strokeDashArray: [5, 5],
                    selectable: false,
                    evented: false,
                    _startX: pointer.x,
                    _startY: pointer.y
                });
                canvas.add(nodeSelectRect);
                return;
            }
            isPotentialPan = true;
            dragStartX = opciones.e.clientX || (opciones.e.touches && opciones.e.touches[0].clientX);
            dragStartY = opciones.e.clientY || (opciones.e.touches && opciones.e.touches[0].clientY);
            return;
        } else {
            procesarClicLienzo(opciones);
        }
    });

    function procesarClicLienzo(opciones) {
        const puntero = canvas.getPointer(opciones.e);

        if (modoActual === 'rectangulo') {
            // Dimensiones iniciales acordadas
            const ancho = 150;
            const alto = 100;

            // Creamos el rectángulo centrado en el punto donde se tocó
            const nuevoRectangulo = new fabric.Rect({
                id: generateId(),
                left: puntero.x - (ancho / 2),
                top: puntero.y - (alto / 2),
                fill: '#8CC9E3', // El azul claro
                stroke: '#0B4A85', // Borde azul oscuro para asegurar que se vea
                strokeWidth: 2,    // Grosor del borde
                strokeUniform: true, // 2.1 Mantiene grosor de borde constante al escalar
                width: ancho,
                height: alto,
                rx: 10, 
                ry: 10
            });

            // Lo añadimos al lienzo
            canvas.add(nuevoRectangulo);
            
            // Opcional: lo seleccionamos automáticamente
            canvas.setActiveObject(nuevoRectangulo);
            
            // Forzamos el repintado
            canvas.renderAll();
        } 
        else if (modoActual === 'circulo') {
            // Dimensiones iniciales del círculo
            const radio = 60; // Diámetro será 120

            // Creamos el círculo centrado en el punto de toque
            const nuevoCirculo = new fabric.Circle({
                id: generateId(),
                left: puntero.x - radio,
                top: puntero.y - radio,
                radius: radio,
                fill: '#FFD166',    // Usamos un color diferente (amarillo pastel) para distinguirlo rápido
                stroke: '#0B4A85',  // Mismo borde oscuro por consistencia
                strokeWidth: 2,
                strokeUniform: true // 2.1 Mantiene grosor de borde constante al escalar
            });

            canvas.add(nuevoCirculo);
            canvas.setActiveObject(nuevoCirculo);
            canvas.renderAll();
        }
        else if (modoActual === 'linea') {
            // FASE 4: Si tocamos cerca de una figura al añadir puntos de la línea, preparamos la vinculación
            var linkBuscado = null;
            var objects = canvas.getObjects();
            for (var i = objects.length - 1; i >= 0; i--) {
                var obj = objects[i];
                if (obj.type === 'polyline' || !obj.id) continue;
                var objBound = obj.getBoundingRect();
                if (puntero.x >= objBound.left - 20 && puntero.x <= objBound.left + objBound.width + 20 &&
                    puntero.y >= objBound.top - 20 && puntero.y <= objBound.top + objBound.height + 20) {
                    linkBuscado = obj.id;
                    break;
                }
            }

            if (puntosLinea.length === 0) {
                lineaStartLinkTemp = linkBuscado;
            } else {
                lineaEndLinkTemp = linkBuscado;
            }

            // Cada toque añade un nuevo nodo con su propio ID (ADN para Fase 5)
            puntosLinea.push({ x: puntero.x, y: puntero.y, id: generateId() });

            if (puntosLinea.length === 1) {
                // Primer punto: mostramos el botón de finalizar
                btnFinalizarLinea.classList.remove('hidden');
                
                // Polyline con 2 puntos idénticos para que empiece a existir visualmente
                const puntosIniciales = [
                    { x: puntero.x, y: puntero.y },
                    { x: puntero.x, y: puntero.y }
                ];
                
                polilineaActiva = new fabric.Polyline(puntosIniciales, {
                    id: generateId(),
                    fill: 'transparent',
                    stroke: '#404040',
                    strokeWidth: 2,
                    strokeUniform: true, // 2.1 Mantiene grosor de borde constante al escalar
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    isDrawing: true // Para que el historial lo ignore temporalmente
                });
                
                canvas.add(polilineaActiva);
            } else {
                // Para que la caja delimitadora (bounding box) englobe correctamente 
                // a toda la línea, la forma más limpia en FabricJS al cambiar los puntos
                // es recrear la polilínea. Así recalcula automáticamente su 'left', 'top', etc.
                if (polilineaActiva) {
                    canvas.remove(polilineaActiva);
                }
                
                polilineaActiva = new fabric.Polyline(Array.from(puntosLinea), {
                    id: generateId(),
                    fill: 'transparent',
                    stroke: '#404040',
                    strokeWidth: 2,
                    strokeUniform: true, // 2.1 Mantiene grosor de borde constante al escalar
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    isDrawing: true // Para que el historial lo ignore temporalmente
                });
                
                canvas.add(polilineaActiva);
            }
            
        }
        else if (modoActual === 'elipse') {
            const rx = 80;  // Ancho total 160
            const ry = 50;  // Alto total 100

            const nuevaElipse = new fabric.Ellipse({
                id: generateId(),
                left: puntero.x - rx,
                top: puntero.y - ry,
                rx: rx,
                ry: ry,
                fill: '#FFC0CB',    // Color rosa pastel de Schemas.py
                stroke: '#0B4A85',  // Borde oscuro consistente
                strokeWidth: 2,
                strokeUniform: true // 2.1 Mantiene grosor de borde constante al escalar
            });

            canvas.add(nuevaElipse);
            canvas.setActiveObject(nuevaElipse);
            canvas.renderAll();
            saveHistory();
        }
        else if (modoActual === 'triangulo') {
            const ancho = 120;
            const alto = 120;

            const nuevoTriangulo = new fabric.Triangle({
                id: generateId(),
                left: puntero.x - (ancho / 2),
                top: puntero.y - (alto / 2),
                width: ancho,
                height: alto,
                fill: '#ADD8E6',    // Color azul cielo pastel de Schemas.py
                stroke: '#0B4A85',  // Borde oscuro consistente
                strokeWidth: 2,
                strokeUniform: true // 2.1 Mantiene grosor de borde constante al escalar
            });

            canvas.add(nuevoTriangulo);
            canvas.setActiveObject(nuevoTriangulo);
            canvas.renderAll();
            saveHistory();
        }
    }

    // ==========================================
    // GESTIÓN DE LA BARRA DE HERRAMIENTAS
    // ==========================================
    
    const botonesHerramientas = document.querySelectorAll('.tool-btn:not(#btn-multiselect)');
    
    // FASE 8: Lógica de Multiselección
    let isMultiSelectMode = false;
    
    // FASE 10: Variables para Pan y Zoom
    let isPanning = false;
    let isPotentialPan = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let isSpacePressed = false;
    let lastPosX = 0;
    let lastPosY = 0;
    
    const btnMultiselect = document.getElementById('btn-multiselect');
    if (btnMultiselect) {
        btnMultiselect.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            isMultiSelectMode = !isMultiSelectMode;
            btnMultiselect.classList.toggle('active', isMultiSelectMode);
        });
    }

    // Sobrescribir comportamiento nativo de FabricJS para simular tecla Shift en dispositivos táctiles
    const originalIsSelectionKeyPressed = canvas._isSelectionKeyPressed;
    canvas._isSelectionKeyPressed = function(e) {
        if (isMultiSelectMode) return true; // Si está activo, forzamos multiselección nativa
        return originalIsSelectionKeyPressed.call(this, e);
    };

    // Función para cambiar de herramienta
    function setModoHerramienta(modo) {
        // Si estábamos haciendo una línea y cambiamos de herramienta, la terminamos
        if (modoActual === 'linea' && modo !== 'linea') {
            finalizarLinea();
        }

        modoActual = modo;
        console.log("Modo cambiado a:", modoActual);

        // Actualizamos visualmente el botón activo
        botonesHerramientas.forEach(btn => {
            if (btn.dataset.tool === modo) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Configuramos el Canvas dependiendo del modo
        if (modoActual === 'seleccion') {
            canvas.isDrawingMode = false;
            canvas.selection = true;
            canvas.forEachObject(obj => {
                if (obj.type === 'textbox') {
                    // FASE 9: Opción A - En modo selección, los textos son transparentes a clics
                    obj.selectable = false;
                    obj.evented = false;
                } else {
                    obj.selectable = true;
                    obj.evented = true;
                }
            });
        } else {
            // Si estamos dibujando figuras, desactivamos la selección de objetos existentes
            // para evitar moverlos sin querer mientras tocamos para dibujar
            canvas.isDrawingMode = false;
            canvas.selection = false;
            canvas.forEachObject(obj => {
                if (obj.type === 'textbox') {
                    // En modo texto sí queremos que se puedan seleccionar
                    obj.selectable = (modoActual === 'texto');
                    obj.evented = (modoActual === 'texto');
                } else {
                    obj.selectable = (modoActual === 'texto' || modoActual === 'linea');
                    obj.evented = true; // Para que puedan recibir doble clic o eventos de línea
                }
            });
        }
        canvas.discardActiveObject();
        canvas.renderAll();
    }

    // FASE 9: Función para iniciar la edición de texto en una figura
    function iniciarEdicionTexto(figura) {
        let textbox = null;
        if (figura.textId) {
            textbox = canvas.getObjects('textbox').find(t => t.id === figura.textId);
        }

        const center = figura.getCenterPoint();

        if (!textbox) {
            textbox = new fabric.Textbox('', {
                id: generateId(),
                parentId: figura.id, // Vínculo bidireccional
                left: center.x,
                top: center.y,
                originX: 'center',
                originY: 'center',
                // FASE 9: Padding del 20% (Ancho al 80% de la figura)
                width: figura.getScaledWidth() * 0.8,
                fontSize: 20,
                fontFamily: 'Arial',
                fill: '#0B4A85', // Azul oscuro de los bordes
                textAlign: 'center',
                splitByGrapheme: false,
                hasControls: false, // El texto se mueve y escala con la figura
                lockMovementX: true,
                lockMovementY: true,
                selectable: (modoActual === 'texto'),
                evented: (modoActual === 'texto'),
                editable: true
            });
            
            // FASE 9: Option C - Clipping
            // Creamos un clipPath basado en la forma original de la figura, sin sus transformaciones de posición global
            // porque el clipPath es relativo al centro del objeto que lo contiene (el textbox).
            let clipObj = null;
            if (figura.type === 'circle') {
                clipObj = new fabric.Circle({ radius: figura.radius * figura.scaleX, originX: 'center', originY: 'center' });
            } else if (figura.type === 'ellipse') {
                clipObj = new fabric.Ellipse({ rx: figura.rx * Math.abs(figura.scaleX), ry: figura.ry * Math.abs(figura.scaleY), originX: 'center', originY: 'center' });
            } else if (figura.type === 'triangle') {
                clipObj = new fabric.Triangle({ width: figura.width * figura.scaleX, height: figura.height * figura.scaleY, originX: 'center', originY: 'center' });
            } else {
                clipObj = new fabric.Rect({ width: figura.width * figura.scaleX, height: figura.height * figura.scaleY, originX: 'center', originY: 'center' });
            }
            textbox.clipPath = clipObj;

            figura.textId = textbox.id;
            canvas.add(textbox);
        }

        // Posicionar el textbox por si la figura se movió
        textbox.set({
            left: center.x,
            top: center.y,
            width: figura.getScaledWidth() * 0.8
        });

        // Hacemos el texto el objeto activo y forzamos edición
        canvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.selectAll();
        canvas.renderAll();
    }

    // FASE 9: Doble clic rápido para entrar en modo edición de texto
    canvas.on('mouse:dblclick', function(options) {
        if (modoActual === 'seleccion' && options.target && options.target.type !== 'polyline' && options.target.type !== 'activeSelection' && options.target.type !== 'textbox') {
            iniciarEdicionTexto(options.target);
        }
    });

    // Asignar eventos de toque/clic a los botones
    botonesHerramientas.forEach(btn => {
        // Usamos pointerdown para que funcione rápido en táctil y también con ratón
        btn.addEventListener('pointerdown', (e) => {
            // Evitamos que el evento llegue al canvas o cause scroll
            e.stopPropagation(); 
            e.preventDefault();
            setModoHerramienta(btn.dataset.tool);
        });
    });

    // ==========================================
    // LÓGICA PARA ARRASTRAR LA BARRA (DRAGGABLE)
    // ==========================================
    const toolbar = document.getElementById('main-toolbar');
    const dragHandle = document.getElementById('toolbar-drag');
    
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // Iniciar arrastre
    dragHandle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        // Calculamos dónde hemos tocado relativo a la esquina de la barra
        const rect = toolbar.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        
        // Quitamos el transform de centrado para usar posicionamiento absoluto directo
        toolbar.style.transform = 'none';
        
        dragHandle.setPointerCapture(e.pointerId); // Capturamos el puntero para que no se pierda al moverse rápido
        e.preventDefault();
    });

    // Mover barra
    dragHandle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        
        // Calculamos la nueva posición asegurándonos de que no se salga de la pantalla
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        
        // Límites básicos para no perder la barra
        newX = Math.max(0, Math.min(newX, window.innerWidth - toolbar.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - toolbar.offsetHeight));

        toolbar.style.left = newX + 'px';
        toolbar.style.top = newY + 'px';
        toolbar.style.bottom = 'auto'; // Quitamos el bottom original
    });

    // Soltar barra
    dragHandle.addEventListener('pointerup', (e) => {
        isDragging = false;
        dragHandle.releasePointerCapture(e.pointerId);
    });

    // Cancelar arrastre si el toque se interrumpe (ej. notificación del sistema)
    dragHandle.addEventListener('pointercancel', (e) => {
        isDragging = false;
        dragHandle.releasePointerCapture(e.pointerId);
    });


    // ==========================================
    // PANEL DE PERSONALIZACIÓN (PROPIEDADES)
    // ==========================================
    const panelPropiedades = document.getElementById('propiedades-panel');
    const colorGrid = document.getElementById('color-grid');
    const grosorRango = document.getElementById('grosor-rango');
    
    // Paleta de colores predefinida basada en Schemas.py
    const paletaColores = [
        '#8CC9E3', '#FFD166', '#FFC0CB', '#ADD8E6', '#404040', 
        '#0B4A85', '#D90429', '#32CD32', '#9400D3', '#FFA500'
    ];

    // Llenar la rejilla de colores
    paletaColores.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        
        swatch.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            aplicarColor(color, swatch);
        });
        
        colorGrid.appendChild(swatch);
    });

    const btnBorrarFigura = document.getElementById('btn-borrar-figura');

    // Funcionalidad de eliminación
    btnBorrarFigura.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const activeObjects = canvas.getActiveObjects();
        
        // 1. Comprobar si estamos borrando un NODO específico (Fase 2)
        if (activeObjects.length === 1 && activeObjects[0].type === 'polyline' && activeObjects[0].edit && activeObjects[0].selectedNodeIndices && activeObjects[0].selectedNodeIndices.length > 0) {
            const poly = activeObjects[0];
            
            // Regla de supervivencia: Si van a quedar 1 punto o menos, borramos toda la línea
            if (poly.points.length - poly.selectedNodeIndices.length <= 1) {
                canvas.remove(poly);
                canvas.discardActiveObject();
                panelPropiedades.classList.add('hidden');
            } else {
                // Tomar un punto de anclaje (para que la línea no salte visualmente)
                let anchorIndex = 0;
                while (poly.selectedNodeIndices.includes(anchorIndex) && anchorIndex < poly.points.length) {
                    anchorIndex++;
                }
                
                var absolutePoint = fabric.util.transformPoint({
                    x: (poly.points[anchorIndex].x - poly.pathOffset.x),
                    y: (poly.points[anchorIndex].y - poly.pathOffset.y)
                }, poly.calcTransformMatrix());

                // Borramos los nodos del array de mayor a menor índice para no alterar los índices pendientes
                let sortedIndices = [...poly.selectedNodeIndices].sort((a, b) => b - a);
                sortedIndices.forEach(idx => {
                    poly.points.splice(idx, 1);
                });
                
                var deletedBeforeAnchor = sortedIndices.filter(idx => idx < anchorIndex).length;
                var newAnchorIndex = anchorIndex - deletedBeforeAnchor;
                
                // Recalculamos dimensiones
                poly._setPositionDimensions({});
                
                // Ajustamos la posición para que no salte
                var polygonBaseSize = poly._getNonTransformedDimensions();
                var newX = (poly.points[newAnchorIndex].x - poly.pathOffset.x) / polygonBaseSize.x;
                var newY = (poly.points[newAnchorIndex].y - poly.pathOffset.y) / polygonBaseSize.y;
                
                poly.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
                
                // Limpiamos selección y reactivamos edición para re-crear controles
                poly.selectedNodeIndices = [];
                activarEdicionNodos(poly);
            }
            
            canvas.renderAll();
            // Disparamos un guardado manual en el historial porque no es added ni removed
            if (typeof saveHistory === 'function') saveHistory();
            return;
        }

        // 2. Si no es un nodo, borrado normal de figuras seleccionadas
        if (activeObjects.length) {
            activeObjects.forEach(obj => canvas.remove(obj));
            canvas.discardActiveObject();
            canvas.renderAll();
            panelPropiedades.classList.add('hidden');
        }
    });

    // FASE 9: Eventos del Panel de Texto
    const textoSize = document.getElementById('texto-size');
    const textoFont = document.getElementById('texto-font');
    const textAlignBtns = document.querySelectorAll('.text-align-btn');

    if (textoSize) {
        textoSize.addEventListener('change', (e) => {
            const activeObjects = canvas.getActiveObjects();
            let textObj = null;
            if (activeObjects.length === 1) {
                if (activeObjects[0].type === 'textbox') textObj = activeObjects[0];
                else if (activeObjects[0].textId) textObj = canvas.getObjects('textbox').find(t => t.id === activeObjects[0].textId);
            }
            if (textObj) {
                if (textObj.isEditing) textObj.setSelectionStyles({ fontSize: parseInt(e.target.value, 10) });
                else textObj.set('fontSize', parseInt(e.target.value, 10));
                
                canvas.renderAll();
                if (typeof saveHistory === 'function') saveHistory();
            }
        });
    }

    if (textoFont) {
        textoFont.addEventListener('change', (e) => {
            const activeObjects = canvas.getActiveObjects();
            let textObj = null;
            if (activeObjects.length === 1) {
                if (activeObjects[0].type === 'textbox') textObj = activeObjects[0];
                else if (activeObjects[0].textId) textObj = canvas.getObjects('textbox').find(t => t.id === activeObjects[0].textId);
            }
            if (textObj) {
                if (textObj.isEditing) textObj.setSelectionStyles({ fontFamily: e.target.value });
                else textObj.set('fontFamily', e.target.value);
                
                canvas.renderAll();
                if (typeof saveHistory === 'function') saveHistory();
            }
        });
    }

    textAlignBtns.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            const align = btn.dataset.textalign;
            const activeObjects = canvas.getActiveObjects();
            let textObj = null;
            if (activeObjects.length === 1) {
                if (activeObjects[0].type === 'textbox') textObj = activeObjects[0];
                else if (activeObjects[0].textId) textObj = canvas.getObjects('textbox').find(t => t.id === activeObjects[0].textId);
            }
            if (textObj) {
                // textAlign aplica a todo el Textbox
                textObj.set('textAlign', align);
                textAlignBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                canvas.renderAll();
                if (typeof saveHistory === 'function') saveHistory();
            }
        });
    });

    // FASE 7 Mejora: Hacer el panelPropiedades arrastrable
    let isPanelPropiedadesDragged = false;
    const propiedadesDragHandle = document.getElementById('propiedades-drag');
    let isDraggingPropiedades = false;
    let propDragStartX, propDragStartY, propPanelStartX, propPanelStartY;

    if (propiedadesDragHandle) {
        propiedadesDragHandle.addEventListener('pointerdown', (e) => {
            isDraggingPropiedades = true;
            propDragStartX = e.clientX;
            propDragStartY = e.clientY;
            propPanelStartX = panelPropiedades.offsetLeft;
            propPanelStartY = panelPropiedades.offsetTop;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('pointermove', (e) => {
            if (!isDraggingPropiedades) return;
            isPanelPropiedadesDragged = true; // Se ha movido manualmente
            const dx = e.clientX - propDragStartX;
            const dy = e.clientY - propDragStartY;
            
            let newX = propPanelStartX + dx;
            let newY = propPanelStartY + dy;
            
            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + panelPropiedades.offsetWidth > window.innerWidth) newX = window.innerWidth - panelPropiedades.offsetWidth;
            if (newY + panelPropiedades.offsetHeight > window.innerHeight) newY = window.innerHeight - panelPropiedades.offsetHeight;
            
            panelPropiedades.style.left = newX + 'px';
            panelPropiedades.style.top = newY + 'px';
        });

        document.addEventListener('pointerup', () => {
            isDraggingPropiedades = false;
            document.body.style.userSelect = '';
        });
    }

    function actualizarPanelParaObjeto(obj) {
        if (!obj) return;
        
        // 1. Mostrar el panel
        panelPropiedades.classList.remove('hidden');
        
        // 2. Posicionar el panel (solo si no se ha movido manualmente)
        if (!isPanelPropiedadesDragged) {
            const objRect = obj.getBoundingRect();
            const canvasDomRect = document.querySelector('.canvas-container').getBoundingClientRect();
            
            // Por defecto, debajo del objeto (sumamos 25px para que no tape los tiradores inferiores)
            let panelTop = canvasDomRect.top + objRect.top + objRect.height + 25;
            let panelLeft = canvasDomRect.left + objRect.left;
            
            // Si se sale por debajo de la pantalla, lo ponemos arriba como plan B
            if (panelTop + panelPropiedades.offsetHeight > window.innerHeight - 10) {
                panelTop = canvasDomRect.top + objRect.top - panelPropiedades.offsetHeight - 25;
            }
            
            // FASE 10: Clamping absoluto Vertical
            if (panelTop < 10) {
                panelTop = 10;
            } else if (panelTop + panelPropiedades.offsetHeight > window.innerHeight - 10) {
                panelTop = window.innerHeight - panelPropiedades.offsetHeight - 10;
            }
            
            // FASE 10: Clamping absoluto Horizontal
            if (panelLeft + panelPropiedades.offsetWidth > window.innerWidth - 10) {
                panelLeft = window.innerWidth - panelPropiedades.offsetWidth - 10;
            }
            if (panelLeft < 10) {
                panelLeft = 10;
            }

            panelPropiedades.style.top = `${panelTop}px`;
            panelPropiedades.style.left = `${panelLeft}px`;
        }

        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects.length) return;

        // 3. Sincronizar el slider de grosor (usamos el del primero)
        grosorRango.value = activeObjects[0].strokeWidth || 2;
        
        // 4. Sincronizar los swatches de color (identificar si hay múltiples colores)
        let colorUnico = null;
        let esMixto = false;
        
        activeObjects.forEach(o => {
            const c = o.type === 'polyline' ? o.stroke : (o.fill === 'transparent' ? o.stroke : o.fill);
            if (colorUnico === null) {
                colorUnico = c;
            } else if (colorUnico !== c) {
                esMixto = true;
            }
        });

        document.querySelectorAll('.color-swatch').forEach(sw => {
            if (!esMixto && colorUnico && (sw.style.backgroundColor === colorUnico || sw.style.backgroundColor === hexToRgb(colorUnico))) {
                sw.classList.add('selected');
            } else {
                sw.classList.remove('selected');
            }
        });

        // 5. Mostrar/Ocultar botón de Editar Nodos (solo para polilíneas individuales)
        const btnEditarNodos = document.getElementById('btn-editar-nodos');
    const btnMultiNodos = document.getElementById('btn-multi-nodos');
        const btnBifurcar = document.getElementById('btn-bifurcar');
        if (activeObjects.length === 1 && activeObjects[0].type === 'polyline') {
            btnEditarNodos.classList.remove('hidden');
            if (activeObjects[0].edit) {
                btnEditarNodos.style.background = 'rgba(255, 255, 255, 0.4)';
                btnMultiNodos.classList.remove('hidden');
                btnMultiNodos.style.background = isMultiNodeSelectActive ? 'rgba(255, 255, 255, 0.4)' : '';
                // FASE 5: Mostrar Bifurcar si hay nodo seleccionado
                if (activeObjects[0].selectedNodeIndices && activeObjects[0].selectedNodeIndices.length > 0) {
                    btnBifurcar.classList.remove('hidden');
                } else {
                    btnBifurcar.classList.add('hidden');
                }
            } else {
                btnEditarNodos.style.background = '';
                btnBifurcar.classList.add('hidden');
                btnMultiNodos.classList.add('hidden');
            }
        } else {
            btnEditarNodos.classList.add('hidden');
            btnBifurcar.classList.add('hidden');
            btnMultiNodos.classList.add('hidden');
        }
        
        // FASE 7: Mostrar botón de Alinear si hay > 1 objeto
        const btnToggleAlinear = document.getElementById('btn-toggle-alinear');
        const panelAlineacion = document.getElementById('panel-alineacion');
        if (activeObjects.length > 1) {
            btnToggleAlinear.classList.remove('hidden');
        } else {
            btnToggleAlinear.classList.add('hidden');
            panelAlineacion.classList.add('hidden');
        }

        // FASE 9: Mostrar subpanel de texto si es un Textbox o una Figura con texto vinculado
        const panelTexto = document.getElementById('panel-texto');
        let textObj = null;
        if (activeObjects.length === 1) {
            if (activeObjects[0].type === 'textbox') {
                textObj = activeObjects[0];
            } else if (activeObjects[0].textId) {
                textObj = canvas.getObjects('textbox').find(t => t.id === activeObjects[0].textId);
            }
        }
        
        if (textObj) {
            panelTexto.classList.remove('hidden');
            document.getElementById('texto-size').value = textObj.fontSize || 20;
            document.getElementById('texto-font').value = textObj.fontFamily || 'Arial';
            document.querySelectorAll('.text-align-btn').forEach(b => {
                if (b.dataset.textalign === textObj.textAlign) b.classList.add('selected');
                else b.classList.remove('selected');
            });
        } else {
            panelTexto.classList.add('hidden');
        }
    }

    // FASE 5: Evento para Botón Bifurcar
    const btnBifurcar = document.getElementById('btn-bifurcar');
    if (btnBifurcar) {
        btnBifurcar.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            const activeObjects = canvas.getActiveObjects();
            if (activeObjects.length === 1 && activeObjects[0].type === 'polyline' && activeObjects[0].edit && activeObjects[0].selectedNodeIndex !== undefined) {
                const poly = activeObjects[0];
                const nodeIndex = poly.selectedNodeIndex;
                const targetPoint = poly.points[nodeIndex];
                
                // Extraer las coordenadas absolutas
                const absolutePoint = fabric.util.transformPoint({
                    x: targetPoint.x - poly.pathOffset.x,
                    y: targetPoint.y - poly.pathOffset.y
                }, poly.calcTransformMatrix());
                
                // Forzar el modo línea
                setModoHerramienta('linea');
                
                // Iniciar la nueva línea con el primer punto anclado al nodo
                lineaStartLinkTemp = { polyId: poly.id, pointId: targetPoint.id };
                puntosLinea.push({ x: absolutePoint.x, y: absolutePoint.y, id: generateId() });
                
                // Mostrar el botón de finalizar línea
                const btnFinalizar = document.getElementById('btn-finalizar-linea');
                btnFinalizar.classList.remove('hidden');
                btnFinalizar.style.left = (absolutePoint.x + 20) + 'px';
                btnFinalizar.style.top = (absolutePoint.y + 20) + 'px';
                
                // Descartar la selección activa para que se pueda dibujar
                canvas.discardActiveObject();
                canvas.renderAll();
                panelPropiedades.classList.add('hidden');
            }
        });
    }

    // FASE 7: Evento para Botón Toggle Alinear
    const btnToggleAlinear = document.getElementById('btn-toggle-alinear');
    const panelAlineacion = document.getElementById('panel-alineacion');
    if (btnToggleAlinear) {
        btnToggleAlinear.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            panelAlineacion.classList.toggle('hidden');
            
            // Si el panel se sale por debajo al expandirse, lo subimos
            if (!panelAlineacion.classList.contains('hidden')) {
                const rect = panelPropiedades.getBoundingClientRect();
                if (rect.bottom > window.innerHeight) {
                    let currentTop = parseFloat(panelPropiedades.style.top);
                    panelPropiedades.style.top = (currentTop - (rect.bottom - window.innerHeight + 10)) + 'px';
                }
            }
        });
    }

    // FASE 7: Eventos para botones de alineación
    document.querySelectorAll('.align-btn').forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            const mode = btn.dataset.align;
            alinearODistribuirSeleccion(mode);
        });
    });

    // FASE 7: Función central de alineación y distribución
    function alinearODistribuirSeleccion(mode) {
        const activeSelection = canvas.getActiveObject();
        if (!activeSelection || activeSelection.type !== 'activeSelection') return;
        
        const allSelected = activeSelection.getObjects();
        const figuras = allSelected.filter(o => o.type !== 'polyline');
        
        if (figuras.length < 2) return; // Se necesitan al menos 2 figuras para alinear

        // Destruimos la selección activa para que las coordenadas vuelvan a ser absolutas en el canvas
        canvas.discardActiveObject();
        
        const boundsData = figuras.map(obj => {
            const rect = obj.getBoundingRect(true, true);
            return {
                obj: obj,
                left: rect.left,
                top: rect.top,
                right: rect.left + rect.width,
                bottom: rect.top + rect.height,
                width: rect.width,
                height: rect.height,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2
            };
        });

        if (mode.startsWith('dist-')) {
            if (mode === 'dist-h') {
                boundsData.sort((a, b) => a.centerX - b.centerX);
                let gaps = [];
                for (let i = 1; i < boundsData.length; i++) {
                    gaps.push(boundsData[i].left - boundsData[i - 1].right);
                }
                const avgGap = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
                
                let currentRight = boundsData[0].right;
                for (let i = 1; i < boundsData.length - 1; i++) {
                    const currentObj = boundsData[i];
                    const targetLeft = currentRight + avgGap;
                    const shiftX = targetLeft - currentObj.left;
                    
                    currentObj.obj.set({ left: currentObj.obj.left + shiftX });
                    currentObj.obj.setCoords();
                    currentRight = targetLeft + currentObj.width;
                }
            } else if (mode === 'dist-v') {
                boundsData.sort((a, b) => a.centerY - b.centerY);
                let gaps = [];
                for (let i = 1; i < boundsData.length; i++) {
                    gaps.push(boundsData[i].top - boundsData[i - 1].bottom);
                }
                const avgGap = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
                
                let currentBottom = boundsData[0].bottom;
                for (let i = 1; i < boundsData.length - 1; i++) {
                    const currentObj = boundsData[i];
                    const targetTop = currentBottom + avgGap;
                    const shiftY = targetTop - currentObj.top;
                    
                    currentObj.obj.set({ top: currentObj.obj.top + shiftY });
                    currentObj.obj.setCoords();
                    currentBottom = targetTop + currentObj.height;
                }
            }
        } else {
            let refValue = 0;
            if (mode === 'left') refValue = Math.min(...boundsData.map(b => b.left));
            else if (mode === 'right') refValue = Math.max(...boundsData.map(b => b.right));
            else if (mode === 'top') refValue = Math.min(...boundsData.map(b => b.top));
            else if (mode === 'bottom') refValue = Math.max(...boundsData.map(b => b.bottom));
            else if (mode === 'center') {
                const minLeft = Math.min(...boundsData.map(b => b.left));
                const maxRight = Math.max(...boundsData.map(b => b.right));
                refValue = (minLeft + maxRight) / 2;
            }
            else if (mode === 'middle') {
                const minTop = Math.min(...boundsData.map(b => b.top));
                const maxBottom = Math.max(...boundsData.map(b => b.bottom));
                refValue = (minTop + maxBottom) / 2;
            }

            boundsData.forEach(item => {
                let shiftX = 0, shiftY = 0;
                
                if (mode === 'left') shiftX = refValue - item.left;
                else if (mode === 'right') shiftX = refValue - item.right;
                else if (mode === 'center') shiftX = refValue - item.centerX;
                else if (mode === 'top') shiftY = refValue - item.top;
                else if (mode === 'bottom') shiftY = refValue - item.bottom;
                else if (mode === 'middle') shiftY = refValue - item.centerY;
                
                item.obj.set({ left: item.obj.left + shiftX, top: item.obj.top + shiftY });
                item.obj.setCoords();
            });
        }

        // FASE 7: Cascada para polilíneas vinculadas
        figuras.forEach(obj => {
            const lines = canvas.getObjects('polyline');
            lines.forEach(poly => {
                const sLink = poly.startNodeLink;
                if (sLink === obj.id || (sLink && sLink.polyId === obj.id)) {
                    actualizarNodoVinculado(poly, 0, sLink === obj.id ? obj : sLink);
                }
                const eLink = poly.endNodeLink;
                if (eLink === obj.id || (eLink && eLink.polyId === obj.id)) {
                    actualizarNodoVinculado(poly, poly.points.length - 1, eLink === obj.id ? obj : eLink);
                }
            });
            
            // FASE 9: Cascada para textos vinculados
            if (obj.textId) {
                const textbox = canvas.getObjects('textbox').find(t => t.id === obj.textId);
                if (textbox) {
                    const center = obj.getCenterPoint ? obj.getCenterPoint() : {x: obj.left, y: obj.top};
                    textbox.set({ left: center.x, top: center.y });
                    textbox.setCoords();
                }
            }
        });

        // Restaurar selección original
        const sel = new fabric.ActiveSelection(allSelected, { canvas: canvas });
        canvas.setActiveObject(sel);
        canvas.renderAll();
        
        saveHistory();
    }

    // ==========================================
    // EDICIÓN DE NODOS DE POLILÍNEAS
    // ==========================================
    let isEditingNodes = false;
    let isMultiNodeSelectActive = false;
    let isMultiNodeSelectDrag = false;
    let nodeSelectRect = null;
    let nodeSelectStartX = 0;
    let nodeSelectStartY = 0;
    const btnEditarNodos = document.getElementById('btn-editar-nodos');
    const btnMultiNodos = document.getElementById('btn-multi-nodos');

    // FASE 6: Funciones para mostrar y ocultar las líneas guía
    function mostrarLineasGuia(x, y, snapH, snapV) {
        if (!guideLineH) {
            guideLineH = new fabric.Line([0, 0, canvas.width, 0], {
                stroke: GUIDE_COLOR, strokeWidth: GUIDE_WIDTH, strokeDashArray: GUIDE_DASH,
                selectable: false, evented: false, objectCaching: false
            });
            canvas.add(guideLineH);
        }
        if (!guideLineV) {
            guideLineV = new fabric.Line([0, 0, 0, canvas.height], {
                stroke: GUIDE_COLOR, strokeWidth: GUIDE_WIDTH, strokeDashArray: GUIDE_DASH,
                selectable: false, evented: false, objectCaching: false
            });
            canvas.add(guideLineV);
        }
        
        // Actualizar posiciones
        guideLineH.set({ y1: y, y2: y, x2: canvas.width });
        guideLineV.set({ x1: x, x2: x, y2: canvas.height });

        // Actualizar estilos según si hay snapping (ortogonalidad)
        if (snapH) {
            guideLineH.set({ stroke: GUIDE_ACTIVE_COLOR, strokeWidth: GUIDE_ACTIVE_WIDTH, strokeDashArray: null });
        } else {
            guideLineH.set({ stroke: GUIDE_COLOR, strokeWidth: GUIDE_WIDTH, strokeDashArray: GUIDE_DASH });
        }
        
        if (snapV) {
            guideLineV.set({ stroke: GUIDE_ACTIVE_COLOR, strokeWidth: GUIDE_ACTIVE_WIDTH, strokeDashArray: null });
        } else {
            guideLineV.set({ stroke: GUIDE_COLOR, strokeWidth: GUIDE_WIDTH, strokeDashArray: GUIDE_DASH });
        }

        guideLineH.bringToFront();
        guideLineV.bringToFront();
    }

    function ocultarLineasGuia() {
        if (guideLineH) {
            canvas.remove(guideLineH);
            guideLineH = null;
        }
        if (guideLineV) {
            canvas.remove(guideLineV);
            guideLineV = null;
        }
    }

    function polylinePositionHandler(dim, finalMatrix, fabricObject) {
        var x = (fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x),
            y = (fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y);
        return fabric.util.transformPoint(
            { x: x, y: y },
            fabric.util.multiplyTransformMatrices(
                fabricObject.canvas.viewportTransform,
                fabricObject.calcTransformMatrix()
            )
        );
    }

    // Función para calcular la intersección de un rayo (desde un nodo hacia el centro de la figura) con su borde
    function getObjectBorderIntersection(obj, rayStart) {
        var center = obj.getCenterPoint();
        if (obj.type === 'circle') {
            var radius = obj.radius * obj.scaleX;
            var dx = rayStart.x - center.x;
            var dy = rayStart.y - center.y;
            var mag = Math.sqrt(dx*dx + dy*dy);
            if (mag === 0) return center;
            return { x: center.x + (dx/mag)*radius, y: center.y + (dy/mag)*radius };
        } else if (obj.type === 'ellipse') {
            var rx = obj.rx * obj.scaleX;
            var ry = obj.ry * obj.scaleY;
            var dx = rayStart.x - center.x;
            var dy = rayStart.y - center.y;
            var angle = Math.atan2(dy, dx);
            return { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) };
        } else {
            // Para rectángulos, triángulos u otros, usamos los 4 puntos de la caja delimitadora (aCoords)
            var points = [obj.aCoords.tl, obj.aCoords.tr, obj.aCoords.br, obj.aCoords.bl];
            for (var i = 0; i < points.length; i++) {
                var p1 = points[i];
                var p2 = points[(i + 1) % points.length];
                var intersect = fabric.Intersection.intersectLineLine(center, rayStart, p1, p2);
                if (intersect.status === "Intersection") {
                    return intersect.points[0];
                }
            }
            return center; // Fallback
        }
    }

    function actionHandler(eventData, transform, x, y) {
        var polygon = transform.target;
        polygon._isNodeDrag = true;
        var currentControl = polygon.controls[polygon.__corner],
            mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center'),
            polygonBaseSize = polygon._getNonTransformedDimensions(),
            size = polygon._getTransformedDimensions(0, 0),
            originalId = polygon.points[currentControl.pointIndex].id;
            
        // Si por alguna razón el nodo no tenía ID, generamos uno
        if (!originalId) {
            originalId = generateId();
            polygon.points[currentControl.pointIndex].id = originalId;
        }

        var finalPointPosition = {
            x: mouseLocalPosition.x * polygonBaseSize.x / size.x + polygon.pathOffset.x,
            y: mouseLocalPosition.y * polygonBaseSize.y / size.y + polygon.pathOffset.y,
            id: originalId
        };
            
        // FASE 4 y 5: VINCULACIÓN (Snapping magnético)
        var nodeIndex = currentControl.pointIndex;
        if (nodeIndex === 0 || nodeIndex === polygon.points.length - 1) {
            var pointer = new fabric.Point(x, y);
            var snapped = false;
            var objects = polygon.canvas.getObjects();
            
            for (var i = 0; i < objects.length; i++) {
                var obj = objects[i];
                if (obj === polygon || !obj.id) continue; 
                
                // Si la línea tiene un vínculo de Fase 5 con la propia línea madre, no debe hacer snapping a otra cosa
                // o si la línea se está bifurcando sobre la marcha.
                // Permitimos engancharse a líneas o formas
                // Permitimos engancharse a líneas o formas
                var objBound = obj.getBoundingRect(true, true); // FASE 10 Fix: usar coords lógicas ignorando el zoom/pan
                if (pointer.x >= objBound.left - 20 && pointer.x <= objBound.left + objBound.width + 20 &&
                    pointer.y >= objBound.top - 20 && pointer.y <= objBound.top + objBound.height + 20) {
                    
                    var center = obj.getCenterPoint();
                    var otherNodeIndex = nodeIndex === 0 ? 1 : polygon.points.length - 2;
                    
                    var otherNodeAbs = fabric.util.transformPoint({
                        x: polygon.points[otherNodeIndex].x - polygon.pathOffset.x,
                        y: polygon.points[otherNodeIndex].y - polygon.pathOffset.y
                    }, polygon.calcTransformMatrix());
                    
                    var intersectionPoint;
                    var linkContract = null;
                    if (obj.type === 'polyline') {
                        // Snapping a un nodo de otra polilínea
                        var minDist = Infinity;
                        var targetNode = null;
                        obj.points.forEach(p => {
                            var pAbs = fabric.util.transformPoint({
                                x: p.x - obj.pathOffset.x,
                                y: p.y - obj.pathOffset.y
                            }, obj.calcTransformMatrix());
                            var dist = Math.pow(pAbs.x - pointer.x, 2) + Math.pow(pAbs.y - pointer.y, 2);
                            if (dist < minDist) {
                                minDist = dist;
                                targetNode = p;
                                intersectionPoint = pAbs;
                            }
                        });
                        if (!targetNode || minDist > 400) continue; // Si no hay nodo cerca (20px^2)
                        
                        if (!targetNode.id) targetNode.id = generateId();
                        linkContract = { polyId: obj.id, pointId: targetNode.id };
                    } else {
                        intersectionPoint = getObjectBorderIntersection(obj, otherNodeAbs);
                        linkContract = obj.id;
                    }
                    
                    var snapLocal = polygon.toLocalPoint(new fabric.Point(intersectionPoint.x, intersectionPoint.y), 'center', 'center');
                    finalPointPosition = {
                        x: snapLocal.x * polygonBaseSize.x / size.x + polygon.pathOffset.x,
                        y: snapLocal.y * polygonBaseSize.y / size.y + polygon.pathOffset.y,
                        id: originalId
                    };
                    
                    if (nodeIndex === 0) polygon.startNodeLink = linkContract;
                    else polygon.endNodeLink = linkContract;
                    
                    snapped = true;
                    break;
                }
            }
            if (!snapped) {
                if (nodeIndex === 0) polygon.startNodeLink = null;
                else polygon.endNodeLink = null;
            }
        }
            
        // FASE 6: ORTOGONALIDAD
        var absPosition = fabric.util.transformPoint({
            x: finalPointPosition.x - polygon.pathOffset.x,
            y: finalPointPosition.y - polygon.pathOffset.y
        }, polygon.calcTransformMatrix());

        var adjacentNodes = [];
        if (nodeIndex > 0) {
            adjacentNodes.push(fabric.util.transformPoint({
                x: polygon.points[nodeIndex - 1].x - polygon.pathOffset.x,
                y: polygon.points[nodeIndex - 1].y - polygon.pathOffset.y
            }, polygon.calcTransformMatrix()));
        }
        if (nodeIndex < polygon.points.length - 1) {
            adjacentNodes.push(fabric.util.transformPoint({
                x: polygon.points[nodeIndex + 1].x - polygon.pathOffset.x,
                y: polygon.points[nodeIndex + 1].y - polygon.pathOffset.y
            }, polygon.calcTransformMatrix()));
        }
        
        // FASE 6: Recopilar nodos adyacentes de bifurcaciones
        var movedPointId = originalId;
        var linesObj = polygon.canvas.getObjects('polyline');
        linesObj.forEach(function(p) {
            if (p === polygon) return;
            var isConnected = false;
            var connectedNodeIndex = -1;
            
            if (p.startNodeLink && p.startNodeLink.pointId === movedPointId) {
                isConnected = true; connectedNodeIndex = 0;
            } else if (p.endNodeLink && p.endNodeLink.pointId === movedPointId) {
                isConnected = true; connectedNodeIndex = p.points.length - 1;
            }
            
            if (isConnected) {
                var adjIndex = connectedNodeIndex === 0 ? 1 : p.points.length - 2;
                if (adjIndex >= 0 && adjIndex < p.points.length) {
                    adjacentNodes.push(fabric.util.transformPoint({
                        x: p.points[adjIndex].x - p.pathOffset.x,
                        y: p.points[adjIndex].y - p.pathOffset.y
                    }, p.calcTransformMatrix()));
                }
            }
        });
        
        // FASE 6: Si nosotros somos la línea hija, recopilar nodos adyacentes de la línea madre
        var linkObj = nodeIndex === 0 ? polygon.startNodeLink : (nodeIndex === polygon.points.length - 1 ? polygon.endNodeLink : null);
        if (linkObj && typeof linkObj === 'object' && linkObj.polyId) {
            var parentPoly = polygon.canvas.getObjects().find(o => o.id === linkObj.polyId);
            if (parentPoly) {
                var targetIdx = parentPoly.points.findIndex(p => p.id === linkObj.pointId);
                if (targetIdx !== -1) {
                    if (targetIdx > 0) {
                        adjacentNodes.push(fabric.util.transformPoint({
                            x: parentPoly.points[targetIdx - 1].x - parentPoly.pathOffset.x,
                            y: parentPoly.points[targetIdx - 1].y - parentPoly.pathOffset.y
                        }, parentPoly.calcTransformMatrix()));
                    }
                    if (targetIdx < parentPoly.points.length - 1) {
                        adjacentNodes.push(fabric.util.transformPoint({
                            x: parentPoly.points[targetIdx + 1].x - parentPoly.pathOffset.x,
                            y: parentPoly.points[targetIdx + 1].y - parentPoly.pathOffset.y
                        }, parentPoly.calcTransformMatrix()));
                    }
                }
            }
        }

        // FASE 6: Algoritmo de Snapping Magnético
        var snapH = false;
        var snapV = false;
        var threshold = 5;
        
        adjacentNodes.forEach(function(adj) {
            if (Math.abs(absPosition.x - adj.x) < threshold) {
                absPosition.x = adj.x;
                snapV = true; // Alineado verticalmente (mismo X)
            }
            if (Math.abs(absPosition.y - adj.y) < threshold) {
                absPosition.y = adj.y;
                snapH = true; // Alineado horizontalmente (mismo Y)
            }
        });
        
        if (snapH || snapV) {
            var snapLocal2 = polygon.toLocalPoint(new fabric.Point(absPosition.x, absPosition.y), 'center', 'center');
            finalPointPosition = {
                x: snapLocal2.x * polygonBaseSize.x / size.x + polygon.pathOffset.x,
                y: snapLocal2.y * polygonBaseSize.y / size.y + polygon.pathOffset.y,
                id: originalId
            };
        }
        
        mostrarLineasGuia(absPosition.x, absPosition.y, snapH, snapV);

        polygon.points[currentControl.pointIndex] = finalPointPosition;
        if (polygon.selectedNodeIndices && polygon.selectedNodeIndices.length > 1) {
            var startPos = polygon._dragStartPositions[nodeIndex];
            var dx = finalPointPosition.x - startPos.x;
            var dy = finalPointPosition.y - startPos.y;
            
            polygon.selectedNodeIndices.forEach(idx => {
                if (idx !== nodeIndex) {
                    var otherStartPos = polygon._dragStartPositions[idx];
                    polygon.points[idx] = {
                        x: otherStartPos.x + dx,
                        y: otherStartPos.y + dy,
                        id: polygon.points[idx].id
                    };
                }
            });
        }
        var movedIndices = (polygon.selectedNodeIndices && polygon.selectedNodeIndices.length > 0) ? polygon.selectedNodeIndices : [currentControl.pointIndex];
        var movedIds = movedIndices.map(idx => polygon.points[idx].id);

        var lines = polygon.canvas.getObjects('polyline');
        lines.forEach(function(p) {
            var sLink = p.startNodeLink;
            if (sLink && movedIds.includes(sLink.pointId)) {
                actualizarNodoVinculado(p, 0, sLink);
            }
            var eLink = p.endNodeLink;
            if (eLink && movedIds.includes(eLink.pointId)) {
                actualizarNodoVinculado(p, p.points.length - 1, eLink);
            }
        });

        // FASE 5: Cascada inversa (Si arrastramos el extremo hijo, tirar del nodo de la madre)
        if (nodeIndex === 0 && polygon.startNodeLink && polygon.startNodeLink.polyId) {
            actualizarNodoPadreDesdeHijo(polygon, 0);
        }
        if (nodeIndex === polygon.points.length - 1 && polygon.endNodeLink && polygon.endNodeLink.polyId) {
            actualizarNodoPadreDesdeHijo(polygon, polygon.points.length - 1);
        }
        
        return true; // triggers object:modified on mouse:up
    }

    // FASE 4 y 5: VINCULACIÓN (El Baile)
    function actualizarNodoVinculado(poly, nodeIndex, obj) {
        var isPolyLink = obj && obj.pointId;
        var linkedObj = isPolyLink ? canvas.getObjects().find(o => o.id === obj.polyId) : obj;
        if (!linkedObj) return;

        var intersectionPoint;
        var otherNodeIndex = nodeIndex === 0 ? 1 : poly.points.length - 2;
        
        var otherNodeAbs = fabric.util.transformPoint({
            x: poly.points[otherNodeIndex].x - poly.pathOffset.x,
            y: poly.points[otherNodeIndex].y - poly.pathOffset.y
        }, poly.calcTransformMatrix());
        
        if (isPolyLink) {
            var targetNode = linkedObj.points.find(p => p.id === obj.pointId);
            if (!targetNode) return;
            intersectionPoint = fabric.util.transformPoint({
                x: targetNode.x - linkedObj.pathOffset.x,
                y: targetNode.y - linkedObj.pathOffset.y
            }, linkedObj.calcTransformMatrix());
        } else {
            intersectionPoint = getObjectBorderIntersection(linkedObj, otherNodeAbs);
        }
        
        var snapLocal = poly.toLocalPoint(new fabric.Point(intersectionPoint.x, intersectionPoint.y), 'center', 'center');
        var polygonBaseSize = poly._getNonTransformedDimensions();
        var size = poly._getTransformedDimensions(0, 0);
        
        var finalPointPosition = {
            x: snapLocal.x * polygonBaseSize.x / size.x + poly.pathOffset.x,
            y: snapLocal.y * polygonBaseSize.y / size.y + poly.pathOffset.y,
            id: poly.points[nodeIndex].id || generateId()
        };
        
        var anchorIndex = otherNodeIndex;
        var absolutePoint = fabric.util.transformPoint({
            x: (poly.points[anchorIndex].x - poly.pathOffset.x),
            y: (poly.points[anchorIndex].y - poly.pathOffset.y)
        }, poly.calcTransformMatrix());
        
        poly.points[nodeIndex] = finalPointPosition;
        
        poly._setPositionDimensions({});
        var newPolygonBaseSize = poly._getNonTransformedDimensions();
        var newX = (poly.points[anchorIndex].x - poly.pathOffset.x) / newPolygonBaseSize.x;
        var newY = (poly.points[anchorIndex].y - poly.pathOffset.y) / newPolygonBaseSize.y;
        poly.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
        
        if (poly.edit) {
            activarEdicionNodos(poly);
        }
        poly.setCoords();
        poly.dirty = true;
        if (poly.canvas) poly.canvas.requestRenderAll();
    }

    function actualizarNodoPadreDesdeHijo(childPoly, childNodeIndex) {
        var link = childNodeIndex === 0 ? childPoly.startNodeLink : childPoly.endNodeLink;
        if (!link || !link.polyId || !link.pointId) return;

        var parentPoly = childPoly.canvas.getObjects().find(o => o.id === link.polyId);
        if (!parentPoly) return;

        var targetPointIndex = parentPoly.points.findIndex(p => p.id === link.pointId);
        if (targetPointIndex === -1) return;

        var childNodeAbs = fabric.util.transformPoint({
            x: childPoly.points[childNodeIndex].x - childPoly.pathOffset.x,
            y: childPoly.points[childNodeIndex].y - childPoly.pathOffset.y
        }, childPoly.calcTransformMatrix());

        var snapLocal = parentPoly.toLocalPoint(new fabric.Point(childNodeAbs.x, childNodeAbs.y), 'center', 'center');
        var polygonBaseSize = parentPoly._getNonTransformedDimensions();
        var size = parentPoly._getTransformedDimensions(0, 0);

        var finalPointPosition = {
            x: snapLocal.x * polygonBaseSize.x / size.x + parentPoly.pathOffset.x,
            y: snapLocal.y * polygonBaseSize.y / size.y + parentPoly.pathOffset.y,
            id: link.pointId // Conservamos el ID intacto
        };

        var anchorIndex = targetPointIndex === 0 ? 1 : 0;
        if (anchorIndex >= parentPoly.points.length) anchorIndex = 0;
        
        var absolutePoint = fabric.util.transformPoint({
            x: (parentPoly.points[anchorIndex].x - parentPoly.pathOffset.x),
            y: (parentPoly.points[anchorIndex].y - parentPoly.pathOffset.y)
        }, parentPoly.calcTransformMatrix());

        parentPoly.points[targetPointIndex] = finalPointPosition;

        parentPoly._setPositionDimensions({});
        var newPolygonBaseSize = parentPoly._getNonTransformedDimensions();
        var newX = (parentPoly.points[anchorIndex].x - parentPoly.pathOffset.x) / newPolygonBaseSize.x;
        var newY = (parentPoly.points[anchorIndex].y - parentPoly.pathOffset.y) / newPolygonBaseSize.y;
        parentPoly.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
        
        parentPoly.setCoords();
        parentPoly.dirty = true;
        if (parentPoly.canvas) parentPoly.canvas.requestRenderAll();
        
        // Propagar el movimiento a otras líneas que dependan de este mismo nodo madre
        var lines = childPoly.canvas.getObjects('polyline');
        lines.forEach(function(p) {
            if (p === childPoly) return; // Evitar loop
            var sLink = p.startNodeLink;
            if (sLink && sLink.pointId === link.pointId) {
                actualizarNodoVinculado(p, 0, sLink);
            }
            var eLink = p.endNodeLink;
            if (eLink && eLink.pointId === link.pointId) {
                actualizarNodoVinculado(p, p.points.length - 1, eLink);
            }
        });
    }

    function anchorWrapper(anchorIndex, fn) {
        return function(eventData, transform, x, y) {
            var fabricObject = transform.target;
            
            // Buscar un ancla válida (un nodo NO seleccionado)
            var actualAnchor = anchorIndex;
            var isMovingAll = false;
            if (fabricObject.selectedNodeIndices && fabricObject.selectedNodeIndices.length > 0) {
                let found = false;
                for (let i = 0; i < fabricObject.points.length; i++) {
                    if (!fabricObject.selectedNodeIndices.includes(i)) {
                        actualAnchor = i;
                        found = true;
                        break;
                    }
                }
                if (!found) isMovingAll = true;
            }
            
            var absolutePoint = fabric.util.transformPoint({
                x: (fabricObject.points[actualAnchor].x - fabricObject.pathOffset.x),
                y: (fabricObject.points[actualAnchor].y - fabricObject.pathOffset.y)
            }, fabricObject.calcTransformMatrix());
            
            var actionPerformed = fn(eventData, transform, x, y);
            
            if (isMovingAll) {
                absolutePoint = fabric.util.transformPoint({
                    x: (fabricObject.points[actualAnchor].x - fabricObject.pathOffset.x),
                    y: (fabricObject.points[actualAnchor].y - fabricObject.pathOffset.y)
                }, fabricObject.calcTransformMatrix());
            }
            
            var newDim = fabricObject._setPositionDimensions({});
            var polygonBaseSize = fabricObject._getNonTransformedDimensions();
            var newX = (fabricObject.points[actualAnchor].x - fabricObject.pathOffset.x) / polygonBaseSize.x;
            var newY = (fabricObject.points[actualAnchor].y - fabricObject.pathOffset.y) / polygonBaseSize.y;
            
            fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
            return actionPerformed;
        }
    }

    function nodeMouseUpHandler(eventData, transform, x, y) {
        var poly = this.polyRef;
        if (!poly) return;
        if (isMultiNodeSelectActive && poly._potentialDeselectIndex === this.pointIndex && !poly._isNodeDrag) {
            const idx = poly.selectedNodeIndices.indexOf(this.pointIndex);
            if (idx !== -1) {
                poly.selectedNodeIndices.splice(idx, 1);
                poly.canvas.requestRenderAll();
                if (typeof actualizarPanelParaObjeto === 'function') actualizarPanelParaObjeto(poly);
            }
        }
        poly._isNodeDrag = false;
        poly._potentialDeselectIndex = null;
    }

    function nodeMouseDownHandler(eventData, transform, x, y) {
        var poly = this.polyRef;
        if (!poly) return;
        
        poly._isNodeDrag = false;
        poly._potentialDeselectIndex = null;
        
        // Asignar el índice seleccionado al polígono
        if (!poly.selectedNodeIndices) poly.selectedNodeIndices = [];
        if (isMultiNodeSelectActive) {
            const idx = poly.selectedNodeIndices.indexOf(this.pointIndex);
            if (idx === -1) {
                poly.selectedNodeIndices.push(this.pointIndex);
            } else {
                poly._potentialDeselectIndex = this.pointIndex;
            }
        } else {
            if (!poly.selectedNodeIndices.includes(this.pointIndex)) {
                poly.selectedNodeIndices = [this.pointIndex];
            }
        }
        poly._dragStartPositions = poly.points.map(p => ({x: p.x, y: p.y}));
        
        // FASE 5: Asegurar que este nodo tiene un ID interno antes de cualquier operación
        if (!poly.points[this.pointIndex].id) {
            poly.points[this.pointIndex].id = generateId();
        }
        
        if (poly.canvas) poly.canvas.requestRenderAll();
        
        // FASE 5: Mostrar el botón de bifurcación inmediatamente al hacer tap
        actualizarPanelParaObjeto(poly);
    }

    function renderNodoEspecial(ctx, left, top, styleOverride, fabricObject) {
        styleOverride = styleOverride || {};
        var poly = this.polyRef || fabricObject;
        
        // Si este control es el seleccionado, forzamos rojo, si no, amarillo
        if (poly && poly.selectedNodeIndices && poly.selectedNodeIndices.includes(this.pointIndex)) {
            styleOverride.cornerColor = 'rgba(217, 4, 41, 1)';
            styleOverride.cornerSize = 18; // Lo hacemos un pelín más grande al seleccionarlo
        } else {
            styleOverride.cornerColor = 'rgba(255, 209, 102, 0.8)';
            styleOverride.cornerSize = 16;
        }
        fabric.controlsUtils.renderCircleControl.call(this, ctx, left, top, styleOverride, poly);
    }

    function activarEdicionNodos(poly) {
        poly.selectedNodeIndices = []; // Reseteamos la selección al entrar
        poly.controls = poly.points.reduce(function(acc, point, index) {
            acc['p' + index] = new fabric.Control({
                positionHandler: polylinePositionHandler,
                actionHandler: anchorWrapper(index > 0 ? index - 1 : index + 1, actionHandler),
                actionName: 'modifyPolygon',
                pointIndex: index,
                polyRef: poly, // Referencia directa y segura al polígono
                mouseDownHandler: nodeMouseDownHandler,
                mouseUpHandler: nodeMouseUpHandler,
                render: renderNodoEspecial
            });
            return acc;
        }, {});
        poly.hasBorders = false;
        poly.cornerStyle = 'circle';
        poly.transparentCorners = false;
        poly.edit = true;
        isEditingNodes = true;
        
        // Refrescar panel visual
        btnEditarNodos.style.background = 'rgba(255, 255, 255, 0.4)';
        btnMultiNodos.classList.remove('hidden');
        canvas.requestRenderAll();
    }

    function desactivarEdicionNodos(poly) {
        if (!poly) return;
        poly.edit = false;
        isEditingNodes = false;
        poly.selectedNodeIndices = [];
        poly.hasBorders = true;
        poly.cornerStyle = 'rect'; // Nuestros cuadrados huecos
        poly.cornerColor = 'transparent';
        poly.cornerSize = 10;
        poly.transparentCorners = false;
        
        // Restaurar controles por defecto de fabric
        poly.controls = fabric.Object.prototype.controls;
        poly.setCoords();
        
        // Refrescar panel visual
        btnEditarNodos.style.background = '';
        btnMultiNodos.classList.add('hidden');
        isMultiNodeSelectActive = false;
        btnMultiNodos.style.background = '';
        canvas.requestRenderAll();
    }

    btnEditarNodos.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const activeObj = canvas.getActiveObject();
        if (activeObj && activeObj.type === 'polyline') {
            if (activeObj.edit) {
                desactivarEdicionNodos(activeObj);
            } else {
                activarEdicionNodos(activeObj);
            }
        }
    });

    btnMultiNodos.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        isMultiNodeSelectActive = !isMultiNodeSelectActive;
        btnMultiNodos.style.background = isMultiNodeSelectActive ? 'rgba(255, 255, 255, 0.4)' : '';
    });

    // Convertir hex a rgb para la comparación en línea
    function hexToRgb(hex) {
        if (!hex || hex === 'transparent') return '';
        // Si ya es rgb no hacemos nada (por simplicidad), asumiremos un formato hex estricto de la paleta.
        return hex;
    }

    function aplicarColor(color, swatchElement) {
        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects.length) return;
        
        // Iteramos sobre todos los objetos seleccionados
        activeObjects.forEach(obj => {
            if (obj.type === 'polyline') {
                obj.set({ stroke: color });
            } else if (obj.type === 'textbox') {
                // FASE 9: Si es texto y está en modo edición, colorear solo lo seleccionado
                if (obj.isEditing) {
                    obj.setSelectionStyles({ fill: color });
                } else {
                    obj.set({ fill: color });
                }
            } else {
                obj.set({ fill: color });
                // Si la figura tiene texto vinculado, aplicar color al texto también?
                // Mejor dejar que el texto mantenga su color independiente, pero
                // el usuario pide que sea independiente, aunque el swatch lo tenemos arriba.
            }
        });
        
        canvas.renderAll();
        
        // Actualizar UI del panel
        document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('selected'));
        if (swatchElement) swatchElement.classList.add('selected');
    }

    grosorRango.addEventListener('input', (e) => {
        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects.length) return;
        
        const nuevoGrosor = parseInt(e.target.value, 10);
        activeObjects.forEach(obj => {
            obj.set({ strokeWidth: nuevoGrosor });
        });
        canvas.renderAll();
    });
    
    // Evitar que arrastrar el slider mueva el canvas
    panelPropiedades.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });

    // Función matemática: distancia cuadrada mínima de un punto a un segmento rectilíneo
    function pointToSegmentDistanceSq(p, v, w) {
        var l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
        var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2);
    }

    // Eventos de selección del Canvas
    canvas.on('mouse:up', function(options) {
        if (options.target && options.target.type === 'polyline' && options.target.edit) {
            var target = options.target;
            if (target._lastClickedNodeIndex !== undefined && !target._isNodeDrag) {
                // Fue un CLIC puro sobre un nodo que YA estaba seleccionado
                if (isMultiNodeSelectActive) {
                    const idx = target.selectedNodeIndices.indexOf(target._lastClickedNodeIndex);
                    if (idx !== -1) target.selectedNodeIndices.splice(idx, 1);
                } else {
                    target.selectedNodeIndices = [target._lastClickedNodeIndex];
                }
                canvas.requestRenderAll();
                if (typeof actualizarPanelParaObjeto === 'function') actualizarPanelParaObjeto(target);
            }
            target._lastClickedNodeIndex = undefined;
            target._isNodeDrag = false;
        }
        
        // FASE 6: Ocultar líneas guía al soltar el ratón
        ocultarLineasGuia();
    });

    canvas.on('mouse:down', function(options) {
        if (!isEditingNodes) return;
        var target = options.target;
        if (target && target.type === 'polyline' && target.edit) {
            // FabricJS expone __corner cuando se clica un control en v5
            var corner = target.__corner; 
            
            // Si el objeto interno no tiene el corner, intentamos buscarlo manualmente
            if (!corner && options.e) {
                var pointer = canvas.getPointer(options.e, true);
                corner = target._findTargetCorner(pointer);
            }
            
            if (corner && target.controls[corner]) {
                var control = target.controls[corner];
                if (control.pointIndex !== undefined) {
                    if (!target.selectedNodeIndices) target.selectedNodeIndices = [];
                    target._isNodeDrag = false;
                    target._lastClickedNodeIndex = control.pointIndex;
                    
                    // Si el nodo NO estaba seleccionado, lo seleccionamos inmediatamente
                    if (!target.selectedNodeIndices.includes(control.pointIndex)) {
                        if (isMultiNodeSelectActive) {
                            target.selectedNodeIndices.push(control.pointIndex);
                        } else {
                            target.selectedNodeIndices = [control.pointIndex];
                        }
                        target._lastClickedNodeIndex = undefined; // Ya ha sido procesado
                    }
                    
                    target._dragStartPositions = target.points.map(p => ({x: p.x, y: p.y}));
                    
                    // FASE 5: Generar ID si falta y actualizar UI
                    if (!target.points[control.pointIndex].id) {
                        target.points[control.pointIndex].id = generateId();
                    }
                    
                    canvas.requestRenderAll();
                    actualizarPanelParaObjeto(target);
                }
            } else {
                // Si ha clicado fuera de los controles pero dentro de la línea
                // FASE 3: Añadir un nuevo nodo en este punto
                
                // 1. Obtener la posición del click relativa al canvas
                var pointer = canvas.getPointer(options.e);
                
                // 2. Transformar esa posición al sistema de coordenadas de los puntos del polígono
                var mouseLocalPosition = target.toLocalPoint(new fabric.Point(pointer.x, pointer.y), 'center', 'center');
                var polygonBaseSize = target._getNonTransformedDimensions();
                var size = target._getTransformedDimensions(0, 0);
                var finalPointPosition = {
                    x: mouseLocalPosition.x * polygonBaseSize.x / size.x + target.pathOffset.x,
                    y: mouseLocalPosition.y * polygonBaseSize.y / size.y + target.pathOffset.y,
                    id: generateId()
                };
                
                // 3. Encontrar el segmento más cercano
                var minDistance = Infinity;
                var segmentIndex = -1;
                for (var i = 0; i < target.points.length - 1; i++) {
                    var dist = pointToSegmentDistanceSq(finalPointPosition, target.points[i], target.points[i+1]);
                    if (dist < minDistance) {
                        minDistance = dist;
                        segmentIndex = i;
                    }
                }
                
                // Si encontramos un segmento válido, insertamos el nodo
                if (segmentIndex !== -1) {
                    // Tomar un ancla para no desviar la línea visualmente
                    var anchorIndex = 0;
                    var absolutePoint = fabric.util.transformPoint({
                        x: (target.points[anchorIndex].x - target.pathOffset.x),
                        y: (target.points[anchorIndex].y - target.pathOffset.y)
                    }, target.calcTransformMatrix());

                    // Inyectar el nuevo punto en el array
                    target.points.splice(segmentIndex + 1, 0, finalPointPosition);
                    
                    // Recalcular
                    target._setPositionDimensions({});
                    
                    var newPolygonBaseSize = target._getNonTransformedDimensions();
                    var newX = (target.points[anchorIndex].x - target.pathOffset.x) / newPolygonBaseSize.x;
                    var newY = (target.points[anchorIndex].y - target.pathOffset.y) / newPolygonBaseSize.y;
                    
                    target.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
                    
                    // Reactivamos el modo edición para regenerar controles
                    activarEdicionNodos(target);
                    target.selectedNodeIndex = segmentIndex + 1; // Seleccionamos el nodo que acabamos de crear
                    
                    canvas.requestRenderAll();
                    if (typeof saveHistory === 'function') saveHistory();
                } else {
                    target.selectedNodeIndex = undefined;
                    canvas.requestRenderAll();
                }
            }
        }
    });

    canvas.on('selection:created', () => {
        actualizarPanelParaObjeto(canvas.getActiveObject());
    });
    
    canvas.on('selection:updated', (e) => {
        if (e.deselected) {
            e.deselected.forEach(obj => {
                if (obj.type === 'polyline' && obj.edit) desactivarEdicionNodos(obj);
            });
        }
        actualizarPanelParaObjeto(canvas.getActiveObject());
    });
    
    canvas.on('selection:cleared', (e) => {
        if (e.deselected) {
            e.deselected.forEach(obj => {
                if (obj.type === 'polyline' && obj.edit) desactivarEdicionNodos(obj);
            });
        }
        panelPropiedades.classList.add('hidden');
        isPanelPropiedadesDragged = false; // Resetear para que la proxima figura autoposicione
    });
    
    // Si arrastramos o escalamos el objeto, escondemos el panel temporalmente por rendimiento y limpieza visual
    canvas.on('object:moving', () => panelPropiedades.classList.add('hidden'));
    
    // FASE 9: Sincronizar texto durante el escalado interactivo
    canvas.on('object:scaling', (e) => {
        panelPropiedades.classList.add('hidden');
        const obj = e.target;
        if (!obj || !obj.textId) return;
        
        let textbox = canvas.getObjects('textbox').find(t => t.id === obj.textId);
        if (textbox) {
            const center = obj.getCenterPoint ? obj.getCenterPoint() : {x: obj.left, y: obj.top};
            textbox.set({
                left: center.x,
                top: center.y,
                width: obj.getScaledWidth() * 0.8
            });
            // El clipping real se hornea en object:modified, pero actualizamos pos/ancho en tiempo real
            textbox.setCoords();
        }
    });

    canvas.on('object:rotating', () => panelPropiedades.classList.add('hidden'));
    
    canvas.on('object:modified', (e) => {
        const obj = e.target;
        if (!obj) return;
        
        // AUTO-CORRECCIÓN DE ESCALA (Opción A):
        // "Horneamos" la escala en el ancho/alto real de la figura para que no 
        // se distorsionen los radios de las esquinas (rectángulos) ni la limpieza general.
        if (obj.scaleX !== 1 || obj.scaleY !== 1) {
            
            if (obj.type === 'rect' || obj.type === 'triangle') {
                obj.set({
                    width: obj.width * Math.abs(obj.scaleX),
                    height: obj.height * Math.abs(obj.scaleY),
                    scaleX: Math.sign(obj.scaleX) || 1,
                    scaleY: Math.sign(obj.scaleY) || 1
                });
            } else if (obj.type === 'ellipse') {
                obj.set({
                    rx: obj.rx * Math.abs(obj.scaleX),
                    ry: obj.ry * Math.abs(obj.scaleY),
                    width: obj.width * Math.abs(obj.scaleX),
                    height: obj.height * Math.abs(obj.scaleY),
                    scaleX: Math.sign(obj.scaleX) || 1,
                    scaleY: Math.sign(obj.scaleY) || 1
                });
            }
        }

        // FASE 9: Actualizar tamaño y clip de texto vinculado tras aplicar escala real
        if (obj.textId) {
            let textbox = canvas.getObjects('textbox').find(t => t.id === obj.textId);
            if (textbox) {
                const center = obj.getCenterPoint ? obj.getCenterPoint() : {x: obj.left, y: obj.top};
                textbox.set({
                    left: center.x,
                    top: center.y,
                width: obj.getScaledWidth() * 0.8
                });
                let clipObj = null;
                if (obj.type === 'circle') {
                    clipObj = new fabric.Circle({ radius: obj.radius * obj.scaleX, originX: 'center', originY: 'center' });
                } else if (obj.type === 'ellipse') {
                    clipObj = new fabric.Ellipse({ rx: obj.rx * Math.abs(obj.scaleX), ry: obj.ry * Math.abs(obj.scaleY), originX: 'center', originY: 'center' });
                } else if (obj.type === 'triangle') {
                    clipObj = new fabric.Triangle({ width: obj.width * obj.scaleX, height: obj.height * obj.scaleY, originX: 'center', originY: 'center' });
                } else {
                    clipObj = new fabric.Rect({ width: obj.width * obj.scaleX, height: obj.height * obj.scaleY, originX: 'center', originY: 'center' });
                }
                textbox.clipPath = clipObj;
                textbox.setCoords();
            }
        }

        if (canvas.getActiveObject()) {
            actualizarPanelParaObjeto(canvas.getActiveObject());
        }
    });

    // FASE 4, 5 y 8: VINCULACIÓN Y ORTOGONALIDAD EN FIGURAS (Actualización dinámica al mover figuras y líneas)
    canvas.on('object:moving', function(e) {
        var obj = e.target;
        if (!obj || !obj.id) return;
        
        // Si arrastramos una selección múltiple, el grupo se mueve solidario
        if (obj.type === 'activeSelection') return;

        // 1. Si movemos cualquier objeto, buscar líneas que apunten a él y actualizarlas
        var lines = canvas.getObjects('polyline');
        var objCenter = obj.getCenterPoint ? obj.getCenterPoint() : {x: obj.left, y: obj.top};
        var hasLinkedLines = false;
        var adjacentNodes = [];

        lines.forEach(function(poly) {
            if (poly === obj) return;
            var isLinked = false;
            var linkedNodeIndex = -1;

            var sLink = poly.startNodeLink;
            if (sLink === obj.id || (sLink && sLink.polyId === obj.id)) {
                isLinked = true;
                linkedNodeIndex = 0;
            }
            var eLink = poly.endNodeLink;
            if (eLink === obj.id || (eLink && eLink.polyId === obj.id)) {
                isLinked = true;
                linkedNodeIndex = poly.points.length - 1;
            }

            if (isLinked) {
                hasLinkedLines = true;
                // Primero actualizamos para que siga al ratón
                actualizarNodoVinculado(poly, linkedNodeIndex, sLink === obj.id || eLink === obj.id ? obj : (linkedNodeIndex === 0 ? sLink : eLink));
                
                // Recopilar nodos adyacentes de la línea para calcular ortogonalidad
                var adjIndex = linkedNodeIndex === 0 ? 1 : poly.points.length - 2;
                if (adjIndex >= 0 && adjIndex < poly.points.length) {
                    adjacentNodes.push(fabric.util.transformPoint({
                        x: poly.points[adjIndex].x - poly.pathOffset.x,
                        y: poly.points[adjIndex].y - poly.pathOffset.y
                    }, poly.calcTransformMatrix()));
                }
            }
        });

        // FASE 8: Snapping magnético y líneas guía para figuras vinculadas
        if (obj.type !== 'polyline' && hasLinkedLines) {
            var snapH = false;
            var snapV = false;
            var threshold = 5;
            var newCenter = { x: objCenter.x, y: objCenter.y };

            adjacentNodes.forEach(function(adj) {
                if (Math.abs(objCenter.x - adj.x) < threshold) {
                    newCenter.x = adj.x;
                    snapV = true; // Vertical (mismo X)
                }
                if (Math.abs(objCenter.y - adj.y) < threshold) {
                    newCenter.y = adj.y;
                    snapH = true; // Horizontal (mismo Y)
                }
            });

            if (snapH || snapV) {
                // Aplicar offset magnético a la figura
                var dx = newCenter.x - objCenter.x;
                var dy = newCenter.y - objCenter.y;
                obj.set({ left: obj.left + dx, top: obj.top + dy });
                obj.setCoords();
                
                // Re-actualizar líneas con la nueva posición magnética
                lines.forEach(function(poly) {
                    if (poly === obj) return;
                    var sLink = poly.startNodeLink;
                    if (sLink === obj.id || (sLink && sLink.polyId === obj.id)) {
                        actualizarNodoVinculado(poly, 0, sLink === obj.id ? obj : sLink);
                    }
                    var eLink = poly.endNodeLink;
                    if (eLink === obj.id || (eLink && eLink.polyId === obj.id)) {
                        actualizarNodoVinculado(poly, poly.points.length - 1, eLink === obj.id ? obj : eLink);
                    }
                });
            }

            mostrarLineasGuia(newCenter.x, newCenter.y, snapH, snapV);
        } else if (obj.type !== 'polyline' && !hasLinkedLines) {
            // Si no tiene líneas vinculadas, no mostramos guías aquí (se ocultan en mouse:up)
        }

        // FASE 10 Mejora: Vinculación Inversa (Figura captura nodos libres al acercarse)
        if (obj.type !== 'polyline') {
            var objBound = obj.getBoundingRect(true, true);
            lines.forEach(function(poly) {
                // Chequear inicio libre
                if (!poly.startNodeLink) {
                    var p0Abs = fabric.util.transformPoint({
                        x: poly.points[0].x - poly.pathOffset.x,
                        y: poly.points[0].y - poly.pathOffset.y
                    }, poly.calcTransformMatrix());
                    
                    if (p0Abs.x >= objBound.left - 20 && p0Abs.x <= objBound.left + objBound.width + 20 &&
                        p0Abs.y >= objBound.top - 20 && p0Abs.y <= objBound.top + objBound.height + 20) {
                        poly.startNodeLink = obj.id;
                        actualizarNodoVinculado(poly, 0, obj);
                    }
                }
                
                // Chequear fin libre
                if (!poly.endNodeLink) {
                    var lastIdx = poly.points.length - 1;
                    var pEndAbs = fabric.util.transformPoint({
                        x: poly.points[lastIdx].x - poly.pathOffset.x,
                        y: poly.points[lastIdx].y - poly.pathOffset.y
                    }, poly.calcTransformMatrix());
                    
                    if (pEndAbs.x >= objBound.left - 20 && pEndAbs.x <= objBound.left + objBound.width + 20 &&
                        pEndAbs.y >= objBound.top - 20 && pEndAbs.y <= objBound.top + objBound.height + 20) {
                        poly.endNodeLink = obj.id;
                        actualizarNodoVinculado(poly, lastIdx, obj);
                    }
                }
            });
        }

        // 2. Si movemos una línea hija entera, tirar de los nodos madre (Bidireccional)
        if (obj.type === 'polyline') {
            if (obj.startNodeLink && obj.startNodeLink.polyId) {
                actualizarNodoPadreDesdeHijo(obj, 0);
            }
            if (obj.endNodeLink && obj.endNodeLink.polyId) {
                actualizarNodoPadreDesdeHijo(obj, obj.points.length - 1);
            }
        }

        // FASE 9: Sincronizar texto vinculado AL FINAL (después de aplicar snapping u offsets)
        if (obj.textId) {
            let textbox = canvas.getObjects('textbox').find(t => t.id === obj.textId);
            if (textbox) {
                const center = obj.getCenterPoint ? obj.getCenterPoint() : {x: obj.left, y: obj.top};
                textbox.set({
                    left: center.x,
                    top: center.y
                });
                textbox.setCoords();
            }
        }
    });

    // ==========================================
    // SISTEMA DE HISTORIAL (DESHACER/REHACER)
    // ==========================================
    const history = [];
    let historyIndex = -1;
    let isHistoryProcessing = false;

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    function updateUndoRedoUI() {
        btnUndo.disabled = historyIndex <= 0;
        btnRedo.disabled = historyIndex >= history.length - 1;
    }

    // FASE 11: Flag de cambios sin guardar
    let isDirty = false;

    window.addEventListener('beforeunload', function (e) {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = ''; // Muestra el diálogo nativo del navegador
        }
    });

    function saveHistory() {
        if (isHistoryProcessing) return;
        
        isDirty = true; // El lienzo ha cambiado

        // Exportamos a JSON, asegurando guardar las propiedades personalizadas necesarias
        const customProps = ['id', 'textId', 'parentId', 'strokeUniform', 'selectable', 'evented', 'startNodeLink', 'endNodeLink', 'polyId', 'pointId', 'edit', 'hasControls', 'hasBorders'];
        const json = canvas.toJSON(customProps);
        
        // Si estábamos en un paso anterior y hacemos un cambio, borramos el futuro
        if (historyIndex < history.length - 1) {
            history.length = historyIndex + 1;
        }
        
        history.push(json);
        historyIndex++;
        
        updateUndoRedoUI();
    }

    function undo() {
        if (historyIndex <= 0) return;
        
        isHistoryProcessing = true;
        historyIndex--;
        
        const previousJson = history[historyIndex];
        
        canvas.loadFromJSON(previousJson, () => {
            canvas.renderAll();
            // Limpiar UI
            panelPropiedades.classList.add('hidden');
            
            isHistoryProcessing = false;
            updateUndoRedoUI();
        });
    }

    function redo() {
        if (historyIndex >= history.length - 1) return;
        
        isHistoryProcessing = true;
        historyIndex++;
        
        const nextJson = history[historyIndex];
        
        canvas.loadFromJSON(nextJson, () => {
            canvas.renderAll();
            // Limpiar UI
            panelPropiedades.classList.add('hidden');
            
            isHistoryProcessing = false;
            updateUndoRedoUI();
        });
    }

    // Eventos de botones
    btnUndo.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        undo();
    });

    btnRedo.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        redo();
    });

    // Capturar cambios del lienzo
    // Guardamos estado al inicializar
    saveHistory();

    // Guardamos cuando se añade, modifica o borra un objeto
    canvas.on('object:added', (e) => {
        // Ignoramos nodos intermedios de polilíneas durante el dibujo para no ensuciar el historial
        if (isHistoryProcessing || (e.target && e.target.isDrawing)) return;
        saveHistory();
    });
    
    // Para 'object:modified', guardaremos el historial al SOLTAR (en mouse:up)
    // Pero ya tenemos el listener 'object:modified' más arriba (el de la autocorrección).
    // Podemos engancharnos allí, o simplemente escucharlo aquí de nuevo.
    canvas.on('object:modified', (e) => {
        if (isHistoryProcessing) return;
        saveHistory();
    });

    canvas.on('object:removed', (e) => {
        if (isHistoryProcessing || (e.target && e.target.isDrawing)) return;
        saveHistory();
    });

    // FASE 10: Eventos de Teclado Global (Espacio para Pan)
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
            if (canvas.getActiveObject() && canvas.getActiveObject().isEditing) return; // Editando texto en canvas
            
            isSpacePressed = true;
            canvas.defaultCursor = 'grab';
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpacePressed = false;
            canvas.defaultCursor = modoActual === 'mano' ? 'grab' : 'default';
        }
    });

    // FASE 10: Evento Mouse Move para Panning
    canvas.on('mouse:move', function(opciones) {
        if (isMultiNodeSelectDrag) {
            const pointer = canvas.getPointer(opciones.e);
            const w = pointer.x - nodeSelectStartX;
            const h = pointer.y - nodeSelectStartY;
            nodeSelectRect.set({
                left: w < 0 ? pointer.x : nodeSelectStartX,
                top: h < 0 ? pointer.y : nodeSelectStartY,
                width: Math.abs(w),
                height: Math.abs(h)
            });
            canvas.requestRenderAll();
            return;
        }
        if (isPotentialPan && opciones.e) {
            const e = opciones.e;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            const dx = clientX - dragStartX;
            const dy = clientY - dragStartY;
            
            if (!isPanning && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                isPanning = true;
                canvas.selection = false;
                lastPosX = dragStartX;
                lastPosY = dragStartY;
            }
        }

        if (isPanning && opciones.e) {
            const e = opciones.e;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const delta = new fabric.Point(clientX - lastPosX, clientY - lastPosY);
            canvas.relativePan(delta);
            
            lastPosX = clientX;
            lastPosY = clientY;
            
            // FASE 11 Fix: Forzar renderizado para máxima fluidez al arrastrar el esquema
            canvas.requestRenderAll();

            if (panelPropiedades && !panelPropiedades.classList.contains('hidden')) {
                actualizarPanelParaObjeto(canvas.getActiveObject());
            }
        }
    });

    // FASE 10: Evento Mouse Up para soltar Panning
    // Modificaremos el mouse:up existente arriba para no sobreescribirlo aquí.
    const existingMouseUp = canvas.__eventListeners['mouse:up']; 
    // Wait, mejor intercepto en el evento nativo o lo defino bien:
    canvas.on('mouse:up', function(opciones) {
        if (isMultiNodeSelectDrag) {
            isMultiNodeSelectDrag = false;
            if (nodeSelectRect) {
                const poly = canvas.getActiveObject();
                if (poly && poly.type === 'polyline' && poly.edit) {
                    if (!poly.selectedNodeIndices) poly.selectedNodeIndices = [];
                    const rectBound = nodeSelectRect.getBoundingRect();
                    poly.points.forEach((pt, index) => {
                        if (poly.controls['p' + index]) {
                            var localPoint = new fabric.Point(pt.x - poly.pathOffset.x, pt.y - poly.pathOffset.y);
                            var absPoint = fabric.util.transformPoint(localPoint, poly.calcTransformMatrix());
                            if (absPoint.x >= rectBound.left && absPoint.x <= rectBound.left + rectBound.width &&
                                absPoint.y >= rectBound.top && absPoint.y <= rectBound.top + rectBound.height) {
                                if (!poly.selectedNodeIndices.includes(index)) {
                                    poly.selectedNodeIndices.push(index);
                                }
                            }
                        }
                    });
                    actualizarPanelParaObjeto(poly);
                }
                canvas.remove(nodeSelectRect);
                nodeSelectRect = null;
                canvas.requestRenderAll();
            }
            return;
        }
        let fuePan = isPanning;

        if (isPanning) {
            isPanning = false;
            canvas.selection = (modoActual === 'seleccion');
            // FASE 10 Fix: Actualizar coordenadas de todos los objetos para hitboxs precisos tras el pan
            canvas.forEachObject(function(obj) {
                obj.setCoords();
            });
            canvas.requestRenderAll();
        }

        // Si est�bamos en potencial pan (clic en vac�o) pero NO hicimos pan (no arrastramos),
        // entonces el usuario simplemente quer�a hacer clic para crear una figura.
        if (isPotentialPan && !fuePan) {
            procesarClicLienzo(opciones);
        }
        isPotentialPan = false;

        ocultarLineasGuia();
    });

    // FASE 10: Evento Mouse Wheel para Zoom
    let zoomDebounceTimeout = null;
    canvas.on('mouse:wheel', function(opt) {
        let delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.1) zoom = 0.1;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
        
        // FASE 10 Fix: Sincronizar hitboxs usando debounce para evitar stuttering
        if (zoomDebounceTimeout) clearTimeout(zoomDebounceTimeout);
        zoomDebounceTimeout = setTimeout(() => {
            canvas.forEachObject(obj => obj.setCoords());
            canvas.requestRenderAll();
        }, 150);
        
        actualizarTextoZoom(zoom);
        if (!panelPropiedades.classList.contains('hidden')) {
            actualizarPanelParaObjeto(canvas.getActiveObject());
        }
    });

    // FASE 10: Controles de Zoom en UI
    const zoomText = document.getElementById('zoom-text');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');

    function actualizarTextoZoom(z) {
        if(zoomText) zoomText.innerText = Math.round(z * 100) + '%';
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            let zoom = canvas.getZoom() * 1.2;
            if (zoom > 20) zoom = 20;
            canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoom);
            canvas.forEachObject(obj => obj.setCoords());
            actualizarTextoZoom(zoom);
            if (!panelPropiedades.classList.contains('hidden')) actualizarPanelParaObjeto(canvas.getActiveObject());
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            let zoom = canvas.getZoom() / 1.2;
            if (zoom < 0.1) zoom = 0.1;
            canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoom);
            canvas.forEachObject(obj => obj.setCoords());
            actualizarTextoZoom(zoom);
            if (!panelPropiedades.classList.contains('hidden')) actualizarPanelParaObjeto(canvas.getActiveObject());
        });
    }

    if (zoomText) {
        zoomText.addEventListener('dblclick', () => {
            canvas.setViewportTransform([1,0,0,1,0,0]);
            canvas.forEachObject(obj => obj.setCoords());
            actualizarTextoZoom(1);
            if (!panelPropiedades.classList.contains('hidden')) actualizarPanelParaObjeto(canvas.getActiveObject());
        });
    }

    // FASE 10: Tamaño del Lienzo (Document Background)
    const sizeSelector = document.getElementById('canvas-size-selector');
    let documentBg = null;

    if (sizeSelector) {
        sizeSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            
            if (documentBg) {
                canvas.remove(documentBg);
                documentBg = null;
            }

            if (val === 'infinite') {
                canvas.backgroundColor = '#ffffff';
            } else {
                canvas.backgroundColor = '#e0e0e0'; // Gris escritorio
                
                let w = 800;
                let h = 1131; // A4 Ratio approx
                if (val === 'a4-landscape') {
                    w = 1131;
                    h = 800;
                }
                
                documentBg = new fabric.Rect({
                    id: 'document-bg',
                    left: (canvas.width / 2) - (w / 2),
                    top: (canvas.height / 2) - (h / 2),
                    width: w,
                    height: h,
                    fill: '#ffffff',
                    selectable: false,
                    evented: false,
                    hoverCursor: 'default',
                    shadow: new fabric.Shadow({
                        color: 'rgba(0,0,0,0.2)',
                        blur: 20,
                        offsetX: 5,
                        offsetY: 5
                    })
                });
                
                canvas.add(documentBg);
                documentBg.sendToBack();
            }
            canvas.renderAll();
        });
    }

    // ==========================================
    // FASE 11: LÓGICA DE ARCHIVOS, EXPORTACIÓN E IMPRESIÓN
    // ==========================================
    const fileActionsPill = document.getElementById('file-actions-pill');
    const filePillHandle = document.getElementById('file-pill-handle');
    
    let isDraggingFilePill = false;
    let filePillDragStartX, filePillDragStartY, filePillStartX, filePillStartY;

    if (filePillHandle) {
        filePillHandle.addEventListener('pointerdown', (e) => {
            isDraggingFilePill = true;
            filePillDragStartX = e.clientX;
            filePillDragStartY = e.clientY;
            filePillStartX = fileActionsPill.offsetLeft;
            filePillStartY = fileActionsPill.offsetTop;
            
            // Si estaba posicionada por defecto, convertir a px explícitos
            if (!fileActionsPill.style.left) {
                filePillStartX = window.innerWidth - fileActionsPill.offsetWidth - 20; // 20px right
            }
            
            filePillHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        filePillHandle.addEventListener('pointermove', (e) => {
            if (!isDraggingFilePill) return;
            let newX = filePillStartX + (e.clientX - filePillDragStartX);
            let newY = filePillStartY + (e.clientY - filePillDragStartY);
            
            newX = Math.max(0, Math.min(newX, window.innerWidth - fileActionsPill.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - fileActionsPill.offsetHeight));
            
            fileActionsPill.style.left = newX + 'px';
            fileActionsPill.style.top = newY + 'px';
            fileActionsPill.style.right = 'auto'; // Eliminar el right original
        });

        filePillHandle.addEventListener('pointerup', (e) => {
            isDraggingFilePill = false;
            filePillHandle.releasePointerCapture(e.pointerId);
        });
        
        filePillHandle.addEventListener('pointercancel', (e) => {
            isDraggingFilePill = false;
            filePillHandle.releasePointerCapture(e.pointerId);
        });
    }

    // -- File System API handles --
    let currentFileHandle = null;
    let currentFileName = 'esquema.skm';
    const customPropsForSave = ['id', 'textId', 'parentId', 'strokeUniform', 'selectable', 'evented', 'startNodeLink', 'endNodeLink', 'polyId', 'pointId', 'edit', 'hasControls', 'hasBorders'];

    // Funciones Helper de Ficheros
    function updateFileNameDisplay(name) {
        currentFileName = name;
        const display = document.getElementById('current-filename');
        if (display) {
            display.textContent = currentFileName;
        }
    }

    function downloadFile(content, fileName, contentType) {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function loadCanvasFromJSON(jsonString) {
        canvas.loadFromJSON(jsonString, function() {
            // Re-vincular los clipPath de los textos a sus figuras
            canvas.getObjects('textbox').forEach(textObj => {
                if (textObj.parentId) {
                    const parentShape = canvas.getObjects().find(o => o.id === textObj.parentId);
                    if (parentShape) {
                        let clipObj = null;
                        if (parentShape.type === 'circle') {
                            clipObj = new fabric.Circle({ radius: parentShape.radius * parentShape.scaleX, originX: 'center', originY: 'center' });
                        } else if (parentShape.type === 'ellipse') {
                            clipObj = new fabric.Ellipse({ rx: parentShape.rx * parentShape.scaleX, ry: parentShape.ry * parentShape.scaleY, originX: 'center', originY: 'center' });
                        } else if (parentShape.type === 'triangle') {
                            clipObj = new fabric.Triangle({ width: parentShape.width * parentShape.scaleX, height: parentShape.height * parentShape.scaleY, originX: 'center', originY: 'center' });
                        } else {
                            clipObj = new fabric.Rect({ width: parentShape.width * parentShape.scaleX, height: parentShape.height * parentShape.scaleY, originX: 'center', originY: 'center' });
                        }
                        textObj.clipPath = clipObj;
                    }
                }
            });
            canvas.requestRenderAll();
            
            // Limpiar historial
            history = [];
            historyIndex = -1;
            saveHistory(); // Guardar el estado inicial cargado
            isDirty = false; // Como acabamos de cargar, no está sucio
        });
    }

    // Guardar (Save)
    const btnFileSave = document.getElementById('btn-file-save');
    if (btnFileSave) {
        btnFileSave.addEventListener('click', async () => {
            const json = JSON.stringify(canvas.toJSON(customPropsForSave));
            try {
                if (window.showSaveFilePicker) {
                    if (!currentFileHandle) {
                        currentFileHandle = await window.showSaveFilePicker({
                            suggestedName: currentFileName,
                            types: [{ description: 'Schema Touch File', accept: { 'application/json': ['.skm'] } }]
                        });
                        updateFileNameDisplay(currentFileHandle.name);
                    }
                    const writable = await currentFileHandle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    isDirty = false;
                    alert("Esquema guardado correctamente en: " + currentFileName);
                } else {
                    // Fallback
                    downloadFile(json, currentFileName, 'application/json');
                    isDirty = false;
                    alert("Esquema guardado correctamente en: " + currentFileName);
                }
            } catch (err) {
                console.error("Error al guardar:", err);
            }
        });
    }

    // Guardar Como (Save As)
    const btnFileSaveAs = document.getElementById('btn-file-save-as');
    if (btnFileSaveAs) {
        btnFileSaveAs.addEventListener('click', async () => {
            const json = JSON.stringify(canvas.toJSON(customPropsForSave));
            try {
                if (window.showSaveFilePicker) {
                    currentFileHandle = await window.showSaveFilePicker({
                        suggestedName: currentFileName,
                        types: [{ description: 'Schema Touch File', accept: { 'application/json': ['.skm'] } }]
                    });
                    updateFileNameDisplay(currentFileHandle.name);
                    const writable = await currentFileHandle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    isDirty = false;
                    alert("Esquema guardado correctamente en: " + currentFileName);
                } else {
                    downloadFile(json, currentFileName, 'application/json');
                    isDirty = false;
                    alert("Esquema guardado como descargable con nombre: " + currentFileName);
                }
            } catch (err) {
                console.error("Error al guardar como:", err);
            }
        });
    }

    // Abrir
    const btnFileOpen = document.getElementById('btn-file-open');
    if (btnFileOpen) {
        btnFileOpen.addEventListener('click', async () => {
            if (isDirty) {
                if (!confirm("Tienes cambios sin guardar. ¿Seguro que quieres abrir otro archivo y perder los cambios actuales?")) {
                    return;
                }
            }
            try {
                let file = null;
                if (window.showOpenFilePicker) {
                    const [fileHandle] = await window.showOpenFilePicker({
                        types: [{ description: 'Schema Touch File', accept: { 'application/json': ['.skm'] } }]
                    });
                    currentFileHandle = fileHandle;
                    file = await fileHandle.getFile();
                } else {
                    // Fallback con input file
                    file = await new Promise((resolve) => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.skm,application/json';
                        input.onchange = e => resolve(e.target.files[0]);
                        input.click();
                    });
                }
                
                if (file) {
                    updateFileNameDisplay(file.name);
                    const text = await file.text();
                    loadCanvasFromJSON(text);
                }
            } catch (err) {
                console.error("Error al abrir:", err);
            }
        });
    }

    // Exportar Imagen/PDF
    function getCanvasBoundingBox() {
        // Encontrar el bounding box de todos los objetos
        const objects = canvas.getObjects();
        let exportableObjects = objects.filter(o => o.id !== 'document-bg'); // Ignorar fondo
        if (exportableObjects.length === 0) return null;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        exportableObjects.forEach(obj => {
            const br = obj.getBoundingRect(true, true);
            if (br.left < minX) minX = br.left;
            if (br.top < minY) minY = br.top;
            if (br.left + br.width > maxX) maxX = br.left + br.width;
            if (br.top + br.height > maxY) maxY = br.top + br.height;
        });
        const padding = 40;
        return {
            left: minX - padding,
            top: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        };
    }

    function generateExportDataUrl(bbox) {
        const multiplier = 2; // Alta resolución
        const oldWidth = canvas.getWidth();
        const oldHeight = canvas.getHeight();
        const originalTransform = canvas.viewportTransform.slice();
        
        canvas.selection = false;
        canvas.discardActiveObject();
        
        let bg = canvas.getObjects().find(o => o.id === 'document-bg');
        if (bg) bg.visible = false;
        
        // Quitar clipPath de los textos temporalmente. 
        // FabricJS tiene un bug histórico renderizando clipPaths de Textbox al exportar con transformaciones.
        const clipPaths = new Map();
        canvas.getObjects('textbox').forEach(t => {
            if (t.clipPath) {
                clipPaths.set(t, t.clipPath);
                t.clipPath = null;
            }
        });
        
        canvas.setWidth(bbox.width * multiplier);
        canvas.setHeight(bbox.height * multiplier);
        canvas.setViewportTransform([multiplier, 0, 0, multiplier, -bbox.left * multiplier, -bbox.top * multiplier]);
        
        canvas.renderAll();

        const dataUrl = canvas.toDataURL({
            format: 'png',
            quality: 1
        });

        // Restaurar
        if (bg) bg.visible = true;
        clipPaths.forEach((clip, t) => {
            t.clipPath = clip;
        });
        
        canvas.setWidth(oldWidth);
        canvas.setHeight(oldHeight);
        canvas.setViewportTransform(originalTransform);
        canvas.selection = true;
        canvas.renderAll();
        
        return dataUrl;
    }

    function exportar(formato) {
        const bbox = getCanvasBoundingBox();
        if (!bbox) {
            alert("El lienzo está vacío.");
            return;
        }

        const dataUrl = generateExportDataUrl(bbox);

        if (formato === 'png') {
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = 'esquema.png';
            a.click();
        } else if (formato === 'pdf') {
            const { jsPDF } = window.jspdf;
            const orientation = bbox.width > bbox.height ? 'l' : 'p';
            const pdf = new jsPDF(orientation, 'px', [bbox.width, bbox.height]);
            pdf.addImage(dataUrl, 'PNG', 0, 0, bbox.width, bbox.height);
            pdf.save('esquema.pdf');
        }
    }

    const btnExportPng = document.getElementById('btn-export-png');
    if (btnExportPng) btnExportPng.addEventListener('click', () => exportar('png'));

    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) btnExportPdf.addEventListener('click', () => exportar('pdf'));

    // Imprimir
    const btnFilePrint = document.getElementById('btn-file-print');
    if (btnFilePrint) {
        btnFilePrint.addEventListener('click', () => {
            const bbox = getCanvasBoundingBox();
            if (!bbox) return;

            const dataUrl = generateExportDataUrl(bbox);

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Imprimir Esquema</title>
                        <style>
                            body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                            img { max-width: 100%; max-height: 100%; }
                            @media print {
                                @page { size: auto; margin: 0mm; }
                                body { margin: 1cm; }
                            }
                        </style>
                    </head>
                    <body>
                        <img src="${dataUrl}" onload="window.print(); window.close();" />
                    </body>
                </html>
            `);
            printWindow.document.close();
        });
    }

    // Mensaje de inicio
    console.log("Schemas Touch: Barra de herramientas lista.");
});



