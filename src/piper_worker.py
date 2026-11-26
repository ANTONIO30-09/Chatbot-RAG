"""Proceso permanente de Piper: carga la voz una vez y atiende pedidos por stdin (JSON por linea)."""
import json
import os
import sys
import wave

salida = sys.stdout
sys.stdout = sys.stderr  # stdout queda reservado para las respuestas

import onnxruntime

# En contenedores onnxruntime crea un hilo por cada nucleo del host y se atasca.
_Sesion = onnxruntime.InferenceSession


def _sesion(*args, **kwargs):
    opciones = kwargs.get("sess_options") or onnxruntime.SessionOptions()
    opciones.intra_op_num_threads = int(os.environ.get("PIPER_HILOS", "1"))
    opciones.inter_op_num_threads = 1
    kwargs["sess_options"] = opciones
    return _Sesion(*args, **kwargs)


onnxruntime.InferenceSession = _sesion

from piper import PiperVoice

voz = PiperVoice.load(sys.argv[1])
escala = float(sys.argv[2])


def sintetizar(texto, archivo):
    with wave.open(archivo, "wb") as wav:
        if hasattr(voz, "synthesize_wav"):
            from piper import SynthesisConfig
            voz.synthesize_wav(texto, wav, syn_config=SynthesisConfig(length_scale=escala))
        else:
            voz.synthesize(texto, wav, length_scale=escala)


def responder(datos):
    salida.write(json.dumps(datos) + "\n")
    salida.flush()


responder({"listo": True})
for linea in sys.stdin:
    pedido = json.loads(linea)
    try:
        sintetizar(pedido["texto"], pedido["archivo"])
        responder({"ok": True})
    except Exception as e:  # el proceso sigue vivo para el siguiente pedido
        responder({"ok": False, "error": str(e)[:300]})
