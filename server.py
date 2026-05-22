from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import json
import os
import asyncio
from datetime import datetime
from pipeline import run_research_pipeline_generator

app = FastAPI(title="DeepDive Agentic Research Hub")

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HISTORY_FILE = "research_history.json"

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_history(history):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving history: {e}")

@app.get("/api/history")
def get_history():
    return load_history()

@app.post("/api/history/clear")
def clear_history():
    save_history([])
    return {"status": "ok", "message": "History cleared"}

@app.get("/api/research")
async def research(topic: str):
    if not topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    async def event_generator():
        loop = asyncio.get_event_loop()
        queue = asyncio.Queue()

        def run_pipeline():
            try:
                for event in run_research_pipeline_generator(topic):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as e:
                loop.call_soon_threadsafe(queue.put_nowait, {"step": "error", "message": str(e)})
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        # Run the synchronous pipeline in a separate executor thread
        loop.run_in_executor(None, run_pipeline)

        search_results = ""
        scraped_content = ""
        report = ""
        feedback = ""

        while True:
            event = await queue.get()
            if event is None:
                # Save to history if we finished successfully and got report/feedback
                if report and feedback:
                    history = load_history()
                    # Filter out duplicate topic runs to keep it clean
                    history = [h for h in history if h.get("topic").lower() != topic.lower()]
                    history.insert(0, {
                        "topic": topic,
                        "report": report,
                        "feedback": feedback,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                    save_history(history[:20]) # Limit history size
                break

            # Capture results for saving
            step = event.get("step")
            if step == "search_results":
                search_results = event.get("data", "")
            elif step == "reader_results":
                scraped_content = event.get("data", "")
            elif step == "writer_results":
                report = event.get("data", "")
            elif step == "critic_results":
                feedback = event.get("data", "")

            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Serve index.html at root
@app.get("/")
def read_index():
    return FileResponse("static/index.html")

# Create static directory if it does not exist
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
