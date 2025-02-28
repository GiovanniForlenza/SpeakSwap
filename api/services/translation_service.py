import os
import aiohttp
from models import LANGUAGE_MAP

async def translate_text(text: str, source_language: str = "it", target_language: str = "en") -> str:
    """Traduce il testo da una lingua all'altra utilizzando Azure Translator"""
    translator_key = os.getenv("TRANSLATOR_KEY")
    translator_endpoint = os.getenv("TRANSLATOR_ENDPOINT")
    
    if not translator_key or not translator_endpoint:
        raise Exception("Chiavi Azure Translator non configurate")

    headers = {
        "Ocp-Apim-Subscription-Key": translator_key,
        "Ocp-Apim-Subscription-Region": "italynorth",
        "Content-Type": "application/json",
    }

    body = [{"text": text}]
    params = {
        "api-version": "3.0", 
        "from": LANGUAGE_MAP.get(source_language, "it-IT").split("-")[0],
        "to": LANGUAGE_MAP.get(target_language, "en-US").split("-")[0]
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{translator_endpoint}/translate",
            headers=headers,
            json=body,
            params=params
        ) as response:
            result = await response.json()
            return result[0]["translations"][0]["text"]