from typing import List, Optional, AsyncGenerator
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
import json


class AgentService:

    def __init__(self, llm, system_prompt, tools: Optional[List] = None):
        self.llm = llm
        self.system_prompt = (
            system_prompt.content
            if hasattr(system_prompt, "content")
            else str(system_prompt)
        )
        self.tools = tools or []
        # 创建非流式LLM副本给agent使用
        # 原因：create_agent内部用ainvoke调用模型，
        # 如果LLM开启streaming=True，ainvoke走流式路径会报
        # "No generations found in stream"错误
        # astream_events会自动将ainvoke转为事件流，无需LLM本身streaming
        agent_llm = self._create_agent_llm(llm)
        self.agent = create_agent(
            model=agent_llm,
            tools=self.tools,
            system_prompt=self.system_prompt,
        )

    @staticmethod
    def _create_agent_llm(llm) -> ChatOpenAI:
        """从现有LLM创建非流式LLM副本供agent使用"""
        if isinstance(llm, ChatOpenAI):
            # 提取api_key明文（openai_api_key是SecretStr类型，不能直接传给构造函数）
            api_key = llm.openai_api_key
            if hasattr(api_key, 'get_secret_value'):
                api_key = api_key.get_secret_value()
            kwargs = {
                "base_url": llm.openai_api_base,
                "api_key": api_key,
                "model": llm.model_name,
                "streaming": False,  # agent内部用ainvoke，必须关闭streaming
            }
            if llm.temperature is not None:
                kwargs["temperature"] = llm.temperature
            return ChatOpenAI(**kwargs)
        # 非ChatOpenAI类型，直接返回原对象
        return llm

    async def run(self, user_input: str) -> str:
        """运行Agent（自动处理tool calling）"""
        result = await self.agent.ainvoke({
            "messages": [{"role": "user", "content": user_input}]
        })
        return result["messages"][-1].content

    async def stream(self, user_input: str) -> AsyncGenerator[str, None]:
        try:
            stats = {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "model_calls": 0,
                "tool_calls": 0
            }
            processed_model_runs = set()

            async for event in self.agent.astream_events(
                {"messages": [("user", user_input)]},
                version="v2"
            ):
                kind = event["event"]
                metadata = event.get("metadata", {})
                node_name = metadata.get("langgraph_node", "")
                run_id = event.get("run_id", "")

                try:
                    # 1. 模型思考开始
                    if kind == "on_chain_start" and node_name == "model":
                        yield self._json("thought", status="thinking", content="🧠 正在思考中...")

                    # 2. 流式AI内容（streaming=True时触发）
                    elif kind == "on_chat_model_stream" and node_name == "model":
                        chunk = event["data"].get("chunk")
                        if chunk is None:
                            continue
                        content = getattr(chunk, 'content', None)
                        tool_calls = getattr(chunk, 'tool_calls', None)

                        if tool_calls:
                            for tc in tool_calls:
                                tc_name = getattr(tc, 'name', str(tc)) if hasattr(tc, 'name') else tc.get('name', '未知工具')
                                yield self._json("thought", status="tool_start", content=f"🔧 决定调用工具: {tc_name}")
                        elif content and isinstance(content, str) and content.strip():
                            yield self._json("ai_message", content=content)
                        elif isinstance(content, list):
                            for item in content:
                                if isinstance(item, dict) and item.get("type") == "text":
                                    text = item.get("text", "")
                                    if text.strip():
                                        yield self._json("ai_message", content=text)

                    # 3. 模型调用结束（streaming=True时触发，提取token统计）
                    elif kind == "on_chat_model_end" and node_name == "model":
                        stats["model_calls"] += 1
                        output_msg = event["data"].get("output")
                        if output_msg:
                            msg_content = getattr(output_msg, 'content', None)
                            tool_calls = getattr(output_msg, 'tool_calls', None)
                            if tool_calls:
                                for tc in tool_calls:
                                    tc_name = getattr(tc, 'name', '未知工具') if hasattr(tc, 'name') else tc.get('name', '未知工具')
                                    yield self._json("thought", status="tool_start", content=f"🔧 决定调用工具: {tc_name}")
                            elif msg_content and isinstance(msg_content, str) and msg_content.strip():
                                # streaming=True时内容已通过stream事件发送，此处跳过避免重复
                                pass
                        self._extract_usage_from_message(stats, output_msg)
                        yield self._json("stats", data={k: v for k, v in stats.items()})

                    # 4. on_chain_end - model节点（streaming=False时的主要事件源）
                    #    create_agent的model节点在streaming=False时，
                    #    不触发on_chat_model_stream/on_chat_model_end，
                    #    而是通过on_chain_end返回Command对象，内含AIMessage
                    elif kind == "on_chain_end" and node_name == "model" and run_id not in processed_model_runs:
                        processed_model_runs.add(run_id)
                        output_data = event["data"].get("output")
                        # 从Command列表中提取AIMessage
                        messages = self._extract_messages_from_output(output_data)
                        for msg in messages:
                            msg_content = getattr(msg, 'content', None)
                            msg_tool_calls = getattr(msg, 'tool_calls', None)
                            if msg_tool_calls:
                                for tc in msg_tool_calls:
                                    tc_name = getattr(tc, 'name', '未知工具') if hasattr(tc, 'name') else tc.get('name', '未知工具')
                                    yield self._json("thought", status="tool_start", content=f"🔧 决定调用工具: {tc_name}")
                            else:
                                # 先尝试从content提取
                                text = self._extract_text_from_content(msg_content) if msg_content else ""
                                # content为空时，尝试从reasoning字段提取（推理模型如tencent/hy3-preview）
                                if not text:
                                    text = self._extract_reasoning_from_message(msg)
                                if text:
                                    yield self._json("ai_message", content=text)
                            # 提取token统计
                            self._extract_usage_from_message(stats, msg)
                        if messages:
                            stats["model_calls"] += 1
                            yield self._json("stats", data={k: v for k, v in stats.items()})
                        else:
                            # 兜底：递归查找
                            self._extract_usage_recursive(stats, output_data)

                    # 5. 工具调用开始
                    elif kind == "on_tool_start":
                        stats["tool_calls"] += 1
                        tool_input = event["data"].get("input", {})
                        input_preview = self._safe_preview(tool_input)
                        yield self._json("thought", status="tool_start", tool=event["name"],
                                       content=f"🔧 调用工具: {event['name']}", input_preview=input_preview)

                    # 6. 工具调用结束
                    elif kind == "on_tool_end":
                        output = event["data"].get("output")
                        serializable = self._serialize_output(output)
                        parsed = self._try_parse_json(serializable)
                        yield self._json("thought", status="tool_end", tool=event["name"],
                                       content=f"✅ 工具 '{event['name']}' 执行完成",
                                       output=serializable, parsed_output=parsed)

                except Exception as e:
                    print(f"⚠️ 事件 {kind} 处理异常: {str(e)[:100]}")
                    continue

            # 完成总结
            yield self._json("thought", status="complete", content=(
                f"✅ 任务完成 | 模型调用: {stats['model_calls']} 次 | "
                f"工具调用: {stats['tool_calls']} 次 | "
                f"总消耗: {stats['total_tokens']} Tokens "
                f"(输入: {stats['input_tokens']}, 输出: {stats['output_tokens']})"
            ))

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield self._json("error", content=f"❌ 处理异常: {str(e)}")

    # ========== 辅助方法 ==========

    @staticmethod
    def _json(type_: str, **kwargs) -> str:
        """构建标准JSON事件"""
        return json.dumps({"type": type_, **kwargs}, ensure_ascii=False)

    @staticmethod
    def _safe_preview(tool_input, max_len: int = 120) -> str:
        """安全截断工具输入预览"""
        try:
            if isinstance(tool_input, dict):
                safe = {k: v for k, v in tool_input.items()
                       if not any(x in k.lower() for x in ["password", "token", "secret", "key"])}
                preview = json.dumps(safe, ensure_ascii=False, indent=None)
            else:
                preview = str(tool_input)
            return preview[:max_len] + "..." if len(preview) > max_len else preview
        except Exception:
            return "[输入内容]"

    @staticmethod
    def _serialize_output(output) -> str:
        """安全序列化工具输出"""
        try:
            if hasattr(output, 'content'):
                return output.content
            if isinstance(output, (dict, list)):
                return json.dumps(output, ensure_ascii=False, indent=2)
            return str(output)
        except Exception:
            return "[工具返回内容]"

    @staticmethod
    def _try_parse_json(s: str):
        """尝试解析JSON字符串"""
        if isinstance(s, str):
            try:
                return json.loads(s)
            except (json.JSONDecodeError, TypeError):
                pass
        return None

    @staticmethod
    def _extract_text_from_content(content) -> str:
        """从AIMessage.content中提取文本，兼容str和list格式"""
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text", "")
                    if text.strip():
                        texts.append(text.strip())
            return "\n".join(texts)
        return str(content).strip() if content else ""

    @staticmethod
    def _extract_reasoning_from_message(msg) -> str:
        """从AIMessage中提取reasoning内容（如tencent/hy3-preview等推理模型）
        content可能为None，实际内容在reasoning或reasoning_details中
        """
        # 1. 直接属性
        reasoning = getattr(msg, 'reasoning', None)
        if reasoning and isinstance(reasoning, str) and reasoning.strip():
            return reasoning.strip()

        # 2. reasoning_details列表（OpenRouter格式）
        reasoning_details = getattr(msg, 'reasoning_details', None)
        if reasoning_details and isinstance(reasoning_details, list):
            parts = []
            for detail in reasoning_details:
                if isinstance(detail, dict):
                    text = detail.get("text", "")
                    if text.strip():
                        parts.append(text.strip())
                elif hasattr(detail, 'text'):
                    text = detail.text
                    if text and text.strip():
                        parts.append(text.strip())
            if parts:
                return "\n".join(parts)

        # 3. additional_kwargs中查找
        additional = getattr(msg, 'additional_kwargs', {})
        if isinstance(additional, dict):
            for key in ('reasoning', 'reasoning_content', 'reasoning_details'):
                val = additional.get(key)
                if val:
                    if isinstance(val, str) and val.strip():
                        return val.strip()
                    if isinstance(val, list):
                        parts = []
                        for item in val:
                            if isinstance(item, dict):
                                text = item.get("text", "")
                                if text.strip():
                                    parts.append(text.strip())
                        if parts:
                            return "\n".join(parts)

        return ""

    @staticmethod
    def _extract_messages_from_output(output_data):
        """从on_chain_end的output中提取AIMessage列表
        create_agent的model节点返回Command对象列表，
        每个Command包含update字段，update中有messages列表
        """
        messages = []
        if output_data is None:
            return messages
        # Command列表
        if isinstance(output_data, list):
            for item in output_data:
                # Command对象有update属性
                update = getattr(item, 'update', None)
                if update is None and isinstance(item, dict):
                    update = item.get('update')
                if update:
                    msgs = getattr(update, 'get', lambda k, d=None: None)('messages', [])
                    if msgs is None and isinstance(update, dict):
                        msgs = update.get('messages', [])
                    if isinstance(msgs, list):
                        messages.extend(msgs)
                # 也可能是直接的AIMessage
                elif hasattr(item, 'content'):
                    messages.append(item)
        # 单个对象
        elif hasattr(output_data, 'content'):
            messages.append(output_data)
        # 字典
        elif isinstance(output_data, dict):
            msgs = output_data.get('messages', [])
            if isinstance(msgs, list):
                messages.extend(msgs)
        return messages

    def _extract_usage_from_message(self, stats: dict, output_msg):
        """从AIMessage/AIMessageChunk对象直接提取usage_metadata"""
        if output_msg is None:
            return
        # 优先从对象属性获取
        usage = getattr(output_msg, 'usage_metadata', None)
        if usage and isinstance(usage, dict):
            self._accumulate_usage(stats, usage)
            return
        # 备选：从response_metadata获取
        response_meta = getattr(output_msg, 'response_metadata', None)
        if response_meta and isinstance(response_meta, dict):
            token_usage = response_meta.get("token_usage") or response_meta.get("usage")
            if token_usage and isinstance(token_usage, dict):
                self._accumulate_usage(stats, {
                    "input_tokens": token_usage.get("prompt_tokens", 0),
                    "output_tokens": token_usage.get("completion_tokens", 0),
                    "total_tokens": token_usage.get("total_tokens", 0),
                })
                return
        # 尝试从字典格式获取
        if isinstance(output_msg, dict):
            if "usage_metadata" in output_msg:
                self._accumulate_usage(stats, output_msg["usage_metadata"])
            elif "response_metadata" in output_msg:
                rm = output_msg["response_metadata"]
                if isinstance(rm, dict):
                    token_usage = rm.get("token_usage") or rm.get("usage")
                    if token_usage and isinstance(token_usage, dict):
                        self._accumulate_usage(stats, {
                            "input_tokens": token_usage.get("prompt_tokens", 0),
                            "output_tokens": token_usage.get("completion_tokens", 0),
                            "total_tokens": token_usage.get("total_tokens", 0),
                        })

    def _extract_usage_recursive(self, stats: dict, output_data, depth: int = 0):
        """递归从on_chain_end的output中查找usage_metadata"""
        if depth > 5:  # 防止无限递归
            return
        if output_data is None:
            return
        # 直接是AIMessage/AIMessageChunk
        if hasattr(output_data, 'usage_metadata'):
            self._extract_usage_from_message(stats, output_data)
            return
        # 字典
        if isinstance(output_data, dict):
            # 直接包含usage_metadata
            if "usage_metadata" in output_data:
                self._accumulate_usage(stats, output_data["usage_metadata"])
                return
            # 包含messages列表
            messages = output_data.get("messages", [])
            if isinstance(messages, list):
                for msg in messages:
                    self._extract_usage_from_message(stats, msg)
            # 包含update字段
            update = output_data.get("update")
            if update:
                self._extract_usage_recursive(stats, update, depth + 1)
        # 列表
        elif isinstance(output_data, list):
            for item in output_data:
                self._extract_usage_recursive(stats, item, depth + 1)

    @staticmethod
    def _accumulate_usage(stats: dict, usage: dict):
        """安全累加usage_metadata"""
        try:
            stats["input_tokens"] += int(usage.get("input_tokens", 0))
            stats["output_tokens"] += int(usage.get("output_tokens", 0))
            stats["total_tokens"] += int(usage.get("total_tokens", 0))
        except (TypeError, ValueError):
            pass
