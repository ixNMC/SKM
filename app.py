# ==========================================
# app.py - Servidor Backend con Flask
# ==========================================

# Importamos Flask y utilidades necesarias:
# render_template: para renderizar nuestro archivo HTML.
# jsonify: para enviar respuestas en formato JSON a nuestro frontend.
# request: para leer los datos que nos envíe el frontend.
from flask import Flask, render_template, jsonify, request

# Inicializamos la aplicación Flask
app = Flask(__name__)

# --- RUTAS DE VISTAS ---

@app.route('/')
def index():
    """
    Ruta principal. Sirve la interfaz de usuario.
    Busca automáticamente el archivo index.html dentro de la carpeta 'templates'.
    """
    return render_template('index.html')

# --- RUTAS API (Endpoints para comunicación con JS) ---

@app.route('/api/guardar', methods=['POST'])
def guardar_esquema():
    """
    Endpoint para guardar el esquema en el servidor.
    Recibirá un JSON con los datos de Fabric.js.
    """
    # Obtenemos los datos JSON enviados desde el frontend
    datos = request.get_json()
    
    # TODO: Aquí añadiremos la lógica de validación de usuario y guardado en base de datos.
    # Por ahora, solo simulamos que recibimos los datos.
    print("Datos recibidos para guardar:", datos)
    
    # Respondemos al frontend que todo ha ido bien
    return jsonify({"status": "success", "message": "Esquema guardado en el servidor."})

@app.route('/api/cargar', methods=['GET'])
def cargar_esquema():
    """
    Endpoint para cargar un esquema desde el servidor.
    """
    # TODO: Aquí buscaremos en la base de datos el esquema del usuario.
    # Por ahora devolvemos un JSON vacío simulado.
    datos_simulados = {"objetos": []}
    return jsonify({"status": "success", "data": datos_simulados})

# Punto de entrada de la aplicación
if __name__ == '__main__':
    # Arrancamos el servidor en modo debug para facilitar el desarrollo.
    # host='0.0.0.0' permite que puedas acceder desde tu tablet conectada a la misma red WiFi.
    app.run(debug=True, host='0.0.0.0', port=5000)