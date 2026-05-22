from agents import build_reader_agent , build_search_agent , writer_chain , critic_chain

def run_research_pipeline(topic : str) -> dict:

    state = {}

    #search agent working 
    print("\n"+" ="*50)
    print("step 1 - search agent is working ...")
    print("="*50)

    search_agent = build_search_agent()
    search_result = search_agent.invoke({
        "messages" : [("user", f"Find recent, reliable and detailed information about: {topic}")]
    })
    state["search_results"] = search_result['messages'][-1].content

    print("\n search result ",state['search_results'])

    #step 2 - reader agent 
    print("\n"+" ="*50)
    print("step 2 - Reader agent is scraping top resources ...")
    print("="*50)

    reader_agent = build_reader_agent()
    reader_result = reader_agent.invoke({
        "messages": [("user",
            f"Based on the following search results about '{topic}', "
            f"pick the most relevant URL and scrape it for deeper content.\n\n"
            f"Search Results:\n{state['search_results'][:800]}"
        )]
    })

    state['scraped_content'] = reader_result['messages'][-1].content

    print("\nscraped content: \n", state['scraped_content'])

    #step 3 - writer chain 

    print("\n"+" ="*50)
    print("step 3 - Writer is drafting the report ...")
    print("="*50)

    research_combined = (
        f"SEARCH RESULTS : \n {state['search_results']} \n\n"
        f"DETAILED SCRAPED CONTENT : \n {state['scraped_content']}"
    )

    state["report"] = writer_chain.invoke({
        "topic" : topic,
        "research" : research_combined
    })

    print("\n Final Report\n",state['report'])

    #critic report 

    print("\n"+" ="*50)
    print("step 4 - critic is reviewing the report ")
    print("="*50)

    state["feedback"] = critic_chain.invoke({
        "report":state['report']
    })

    print("\n critic report \n", state['feedback'])

    return state


def run_research_pipeline_generator(topic: str):
    state = {}

    # Step 1: Search Agent
    yield {"step": "search_start", "message": f"Search agent is researching: {topic}"}
    try:
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        state["search_results"] = search_result['messages'][-1].content
        yield {"step": "search_results", "data": state["search_results"]}
    except Exception as e:
        yield {"step": "error", "message": f"Error during search: {str(e)}"}
        return

    # Step 2: Reader Agent
    yield {"step": "reader_start", "message": "Reader agent is selecting and scraping the top source..."}
    try:
        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{state['search_results'][:800]}"
            )]
        })
        state['scraped_content'] = reader_result['messages'][-1].content
        yield {"step": "reader_results", "data": state['scraped_content']}
    except Exception as e:
        yield {"step": "error", "message": f"Error during scraping: {str(e)}"}
        return

    # Step 3: Writer Agent
    yield {"step": "writer_start", "message": "Writer chain is compiling research and drafting report..."}
    try:
        research_combined = (
            f"SEARCH RESULTS : \n {state['search_results']} \n\n"
            f"DETAILED SCRAPED CONTENT : \n {state['scraped_content']}"
        )
        state["report"] = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })
        yield {"step": "writer_results", "data": state["report"]}
    except Exception as e:
        yield {"step": "error", "message": f"Error during writing: {str(e)}"}
        return

    # Step 4: Critic Agent
    yield {"step": "critic_start", "message": "Critic chain is analyzing the drafted report..."}
    try:
        state["feedback"] = critic_chain.invoke({
            "report": state['report']
        })
        yield {"step": "critic_results", "data": state["feedback"]}
    except Exception as e:
        yield {"step": "error", "message": f"Error during critic review: {str(e)}"}
        return

    yield {"step": "done", "message": "Research pipeline completed successfully!"}


if __name__ == "__main__":
    topic = input("\n Enter a research topic : ")
    run_research_pipeline(topic)