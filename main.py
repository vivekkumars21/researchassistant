from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from pipeline import run_research_pipeline

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Multi-Agent Research Assistant")

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
)


class ResearchRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)


def to_text(value):
    """Convert LangChain message objects or other values to text."""
    if hasattr(value, "content"):
        return str(value.content)
    return str(value)


@app.get("/")
async def home():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(
        BASE_DIR / "static" / "favicon.svg",
        media_type="image/svg+xml",
    )


@app.post("/api/research")
async def research(request: ResearchRequest):
    topic = request.topic.strip()

    if len(topic) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please enter a research topic with at least 3 characters.",
        )

    try:
        # Run the synchronous LangChain pipeline outside the event loop.
        state = await run_in_threadpool(run_research_pipeline, topic)

        return {
            "topic": topic,
            "search_result": to_text(state.get("search_result", "")),
            "scraped_content": to_text(state.get("scraped_content", "")),
            "report": to_text(state.get("report", "")),
            "feedback": to_text(state.get("feedback", "")),
        }

    except Exception:
        # Keep API keys and internal exception details out of the response.
        import logging

        logging.exception("Research pipeline failed")
        raise HTTPException(
            status_code=500,
            detail="Research failed. Check the backend terminal for details.",
        )
