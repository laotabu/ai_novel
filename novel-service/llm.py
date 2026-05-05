import os
from langchain_openai import ChatOpenAI

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter")

if LLM_PROVIDER == "internal":
    base_llm = ChatOpenAI(base_url=os.getenv("INTERNAL_LLM_URL","http://model-api.desaysv.com"),
                          api_key=os.getenv("INTERNAL_API_KEY",""),
                          model="deepseek-v3.2",
                          temperature=0.3,
                          streaming=False)
else:
    base_llm = ChatOpenAI(base_url="https://openrouter.ai/api/v1",
                          api_key=os.getenv("OPENROUTER_API_KEY",""),
                          model=os.getenv("OPENROUTER_MODEL","tencent/hy3-preview:free"),
                          temperature=0.3,
                          streaming=False,
                          default_headers={"HTTP-Referer":"https://novel-app.local",
                                           "X-Title":"Novel Assistant"})

llm = base_llm
