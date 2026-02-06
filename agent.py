from langchain.agents import create_agent
from fanqie_tool import novel_tool
from deepseek_llm import llm
from prompt import prompt



agent = create_agent(
    model=llm,  # 必须传字符串！源码会自动初始化
    system_prompt=prompt,
    tools=[novel_tool],  # 暂时不传工具（后续扩展）
    middleware=(),  # 空元组（默认值）
    debug=False  # 生产环境关闭
)