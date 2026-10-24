from agents import reader_agent, search_agent, writer_chain, critic_chain
from rich import print


def run_research_pipeline(topic: str) -> dict:
    state = {}

    print("\n" + " =" * 50)
    print("Step 1 - search agent is working ...")
    print("=" * 50)

    build_search_agent = search_agent()
    search_result = build_search_agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": f"find recent, reliable and detailed information about {topic} ",
                }
            ]
        }
    )

    state["search_result"] = search_result["messages"][-1].content

    print("\n search result ", state["search_result"])

    # step 2 reader agent
    print("\n" + " =" * 50)
    print("Step 2 - Reader agent is working ...")
    print("=" * 50)

    build_reader_agent = reader_agent()
    reader_result = build_reader_agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Based on the following search results about '{topic}', "
                        f"pick the most relevant URL and scrape it for deeper content.\n\n"
                        f"Search Results:\n{state['search_result'][:800]}"
                    ),
                }
            ]
        }
    )

    state["scraped_content"] = reader_result["messages"][-1].content

    print("\nscraped content: \n", state["scraped_content"])

    # step 3 Writer chain
    print("\n" + " =" * 50)
    print("Step 3 - Writer is drafting the report ...")
    print("=" * 50)

    research_combined = (
        f"search results : \n {state['search_result']} \n\n"
        f"detailed search result : \n {state['scraped_content']} \n\n"
    )

    state["report"] = writer_chain.invoke(
        {"topic": topic, "research": research_combined}
    )

    print("\nfinal report\n", state["report"])

    # critic report

    print("\n" + " =" * 50)
    print("Step 4 - Critic is reviewing the report ...")
    print("=" * 50)

    state["feedback"] = critic_chain.invoke({"report": state["report"]})

    print("\n critic report\n", state["feedback"])

    return state


if __name__ == "__main__":
    topic = input("\n Enter a research topic \n")
    run_research_pipeline(topic)
