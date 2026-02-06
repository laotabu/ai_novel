from agent import agent
from datetime import datetime
from context_manager import ContextManager
import json
def show_context_menu(context_manager: ContextManager):
    """显示上下文管理菜单 - 修复原代码n未定义错误"""
    print("\n" + "="*50)
    print("📚 上下文管理菜单")
    print("="*50)
    contexts = context_manager.list_available_contexts()
    
    for i, (ctx_type, info) in enumerate(contexts.items(), 1):
        status = "✅ 激活中" if info["active"] else "⬜ 未激活"
        exists = " (✓ 已存在)" if info["exists"] else " (⚠️ 未创建)"
        print(f"{i}. [{status}] {info['description']}{exists}")
    
    print("\n0. 返回主菜单")  # 修复：原{n+1}导致NameError
    print("="*50)
    return contexts

def manage_contexts(context_manager: ContextManager):
    """上下文管理交互流程"""
    while True:
        contexts = show_context_menu(context_manager)
        try:
            choice = input("\n请选择要切换的上下文编号 (输入0返回): ").strip()
            if choice == "0":
                break
                
            idx = int(choice)
            if 1 <= idx <= len(contexts):
                ctx_type = list(contexts.keys())[idx-1]
                current = contexts[ctx_type]["active"]
                if context_manager.toggle_context(ctx_type, not current):
                    status = "激活" if not current else "停用"
                    print(f"✓ 已{status} '{contexts[ctx_type]['description']}'")
                else:
                    print("⚠️ 操作失败，请检查上下文是否存在")
            else:
                print("❌ 无效选择")
        except ValueError:
            print("❌ 请输入有效数字")

if __name__ == "__main__":
    context_manager = ContextManager()
    chat_history = context_manager.load_chat_history() or []  # 修复：确保是列表
    print("✨ AI小说创作助手（含番茄小说解析）已启动！输入 /menu 查看菜单")
    
    
    
    while True:
        try:
            user_input = input("\n👤 你: ").strip()
            
            if user_input.lower() in ['/exit', '/quit']:
                print("👋 再见！")
                break
            elif user_input == "/menu":
                print("\n" + "="*40)
                print("📋 功能菜单")
                print("="*40)
                print("1. 管理上下文 (/context)")
                print("2. 查看当前激活上下文 (/active)")
                print("3. 退出 (/exit)")
                print("="*40)
                continue
            elif user_input == "/context":
                manage_contexts(context_manager)
                continue
            elif user_input == "/active":
                print("\n✅ 当前激活的上下文:")
                for ctx in context_manager.active_contexts:
                    desc = context_manager.context_types.get(ctx, ctx)
                    print(f"  - {desc}")
                continue
            
            if not user_input:
                continue
            
            # === 核心修复：不再拼接上下文到输入，改用变量注入 ===
            current_context = context_manager.get_active_contexts_content()
            # 调用Agent（自动处理工具调用+上下文注入）
            ai_response = ""
            print("🤖 AI: ", end="", flush=True)
            for chunk in agent.stream({
                "input": user_input, 
                "dynamic_context": current_context if current_context else "无可用上下文"
            }, stream_mode="messages"):
                msg = chunk[0]  # LangChain 消息对象
                if hasattr(msg, 'type') and msg.type == 'tool':
                    # 更新小说上下文（保持原有逻辑）
                    if getattr(msg, 'name', '') == 'novel_tool':
                        print("解析到工具")
                        content = str(msg.content)
                        print(content, end="", flush=True)
                        ai_response += content
                    continue
                if hasattr(msg, 'content') and msg.content:
                    clean = (
                        str(msg.content)
                        .replace('\u200b', '')
                        .replace('\uff0c', ',')
                        .replace('\xa0', ' ')
                        .replace('\u3000', ' ')
                    )
                    if clean:
                        print(clean, end="", flush=True)
                        ai_response += clean
            print()
            # === 保存确认逻辑（精准控制）===
            save_choice = input("\n💾 要保存本次对话到上下文吗? (y/n, 默认y): ").strip().lower()
            if save_choice in ['', 'y', 'yes']:
                # 仅当chat_history上下文激活时才实际保存n
                if "chat_history" in context_manager.active_contexts:
                    chat_history.append({
                        "user": user_input,  # 保存原始输入（非拼接内容）
                        "ai": ai_response,
                        "timestamp": datetime.now().isoformat()
                    })
                    context_manager.save_context("chat_history", chat_history, append=False)
                    print("✓ 已保存到对话历史")
                else:
                    print("⚠️ 对话历史上下文未激活，跳过保存")
            else:
                print("⏭️ 已跳过保存")
            
            # 同步内存中的历史（保证会话连续性）
            if "chat_history" in context_manager.active_contexts:
                chat_history = context_manager.load_chat_history() or []
                
        except KeyboardInterrupt:
            print("\n⚠️ 检测到中断，输入 /exit 退出")
        except Exception as e:
            print(f"\n❌ 发生错误: {str(e)}")
            # 仅开发时启用 traceback
            # import traceback
            # traceback.print_exc()