import os
from langchain_openai import ChatOpenAI


# 初始化内部大模型（替换为公司实际地址/密钥）
llm = ChatOpenAI(
    base_url=os.getenv("INTERNAL_LLM_URL", "http://10.133.34.23:3000/v1"),
    api_key=os.getenv("INTERNAL_API_KEY", "sk-k5ExwYigQdAGwjnIYBeH4Or5ag8rmZRff5BLjn1iEuGiRTFn"),
    model="deepseek-v3.1",
    temperature=0.3,
    streaming=True  # ✅ 关键：启用流式模式
)




