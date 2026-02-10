import os
from langchain_openai import ChatOpenAI


# 初始化内部大模型（替换为公司实际地址/密钥）
llm = ChatOpenAI(
    base_url=os.getenv("INTERNAL_LLM_URL", ""),
    api_key=os.getenv("INTERNAL_API_KEY", ""),
    model="deepseek-v3.1",
    temperature=0.3,
    streaming=True  # ✅ 关键：启用流式模式
)





