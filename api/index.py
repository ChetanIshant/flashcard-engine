from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import anthropic
import pdfplumber
import json
import io
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

class ReviewRequest(BaseModel):
    cards: list
    card_index: int
    grade: int  # 0 = forgot, 1 = hard, 2 = good, 3 = easy


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


def sm2_update(card: dict, grade: int) -> dict:
    """SM-2 spaced repetition algorithm."""
    # grade: 0=forgot, 1=hard, 2=good, 3=easy
    q = grade  # quality of response (0-3 mapped to 0-5 scale)
    q_mapped = [0, 2, 4, 5][q]

    ef = card.get("ef", 2.5)
    interval = card.get("interval", 1)
    repetitions = card.get("repetitions", 0)

    if q_mapped >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ef)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1

    ef = max(1.3, ef + 0.1 - (5 - q_mapped) * (0.08 + (5 - q_mapped) * 0.02))

    card["ef"] = round(ef, 2)
    card["interval"] = interval
    card["repetitions"] = repetitions
    card["due_in"] = interval
    return card





@app.post("/api/generate")
async def generate_flashcards(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    text = extract_text_from_pdf(file_bytes)
    if not text or len(text) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

    # Truncate to avoid token limits
    text = text[:12000]

    prompt = f"""You are an expert educator creating high-quality flashcards from study material.

Analyze this text and create comprehensive flashcards that cover:
- Key concepts and definitions
- Important relationships and cause-effect
- Formulas, rules, or principles
- Examples and edge cases
- "Why" questions, not just "what"

Text:
{text}

Return ONLY a valid JSON array with 15-25 flashcard objects. Each object must have exactly:
- "front": the question or prompt (concise, clear)
- "back": the answer (complete but not verbose)
- "topic": a short topic tag (2-3 words max)
- "difficulty": "easy", "medium", or "hard"

No markdown, no explanation, just the raw JSON array."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    # Clean up any markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().rstrip("```").strip()

    cards_data = json.loads(raw)

    # Add SM-2 fields
    cards = []
    for i, c in enumerate(cards_data):
        cards.append({
            "id": i,
            "front": c["front"],
            "back": c["back"],
            "topic": c.get("topic", "General"),
            "difficulty": c.get("difficulty", "medium"),
            "ef": 2.5,
            "interval": 1,
            "repetitions": 0,
            "due_in": 0,
            "status": "new"  # new, learning, mastered
        })

    return {"cards": cards, "total": len(cards), "filename": file.filename}


@app.post("/api/review")
async def update_card(req: ReviewRequest):
    cards = req.cards
    idx = req.card_index
    grade = req.grade

    if idx < 0 or idx >= len(cards):
        raise HTTPException(status_code=400, detail="Invalid card index.")

    card = sm2_update(cards[idx], grade)

    # Update status
    if grade == 0:
        card["status"] = "learning"
    elif card["repetitions"] >= 3 and grade >= 2:
        card["status"] = "mastered"
    elif card["repetitions"] >= 1:
        card["status"] = "learning"

    cards[idx] = card
    return {"card": card, "cards": cards}