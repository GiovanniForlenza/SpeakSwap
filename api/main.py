from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Importa i router dalle routes
from routes import audio_routes, conversation_routes, test_routes

# Carica le variabili d'ambiente
load_dotenv()

# Inizializza l'app
app = FastAPI(title="SpeakSwap API")

# Configura CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crea le directory necessarie
os.makedirs("audio_files", exist_ok=True)
os.makedirs("translated_audio", exist_ok=True)
os.makedirs("generated_audio", exist_ok=True)

# Aggiungi i router
app.include_router(audio_routes.router)
app.include_router(conversation_routes.router)
app.include_router(test_routes.router)

@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to SpeakSwap API"}

# Script di avvio
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)