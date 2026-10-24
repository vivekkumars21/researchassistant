from langchain.tools import tool
import requests
import os
from dotenv import load_dotenv
from tavily import TavilyClient
from bs4 import BeautifulSoup
from rich import print

load_dotenv()

# tavilySearch tool

tavily = TavilyClient()


@tool
def web_search(query: str) -> str:
    """Search the web for recent and reliable information, return titles, url and snippets"""
    response = tavily.search(query=query, max_results=5)

    results = response.get("results", [])

    out = []

    for r in results:
        out.append(
            f"Title: {r['title']}\n"
            f"URL: {r['url']}\n"
            f"Snippet: {r['content'][:300]}\n"
        )

    return "\n".join(out)


@tool
def scrap_url(url: str) -> str:
    """Scrape and return clean text content from a given url for deeper reading"""
    try:
        resp = requests.get(url, timeout=8, headers={"user-agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")

        for tag in soup(["script", "style", "footer", "nav"]):
            tag.decompose()

        return soup.get_text(separator=" ", strip=True)[
            :3000
        ]  # Return first 1000 characters of text content
    except Exception as e:
        return f"Could not scrape the url : {str(e)}"


print(scrap_url.invoke("https://www.bbc.com/news/articles/cgjql614glvo"))
