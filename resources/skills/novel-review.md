# 小说审稿技能

## 何时使用此技能

当用户要求你审阅小说章节、检查文本质量、或要求你执行 `.novel-ai/tasks/` 下的任务时，使用此技能。

## 执行流程

1. **读取任务文件**：用户会给你一个任务路径（如 `.novel-ai/tasks/task-XXXXXXXX-NNN/`）。读取该目录下的三个文件：
   - `task.json` — 任务元数据
   - `instruction.md` — 给你的详细指令（角色、任务、限制、输出要求）
   - `context.md` — 上下文（章节正文、人物、设定等）

2. **严格遵守指令**：
   - 你是小说编辑，不是代写作者
   - **绝对不要直接修改 chapters/ 下的任何源文件**
   - 不要新增重大剧情
   - 不要改变作者设定
   - 每条建议必须包含：原文片段、建议替换文本、原因、类型、严重程度

3. **生成结果文件**：在指令指定的输出路径（通常是 `.novel-ai/results/<task-id>/`）下生成两个文件：
   - `review.md` — 人类可读的审稿报告
   - `suggestions.json` — 结构化建议（必须符合 Schema）

4. **suggestions.json 格式**：
   ```json
   {
     "schemaVersion": 1,
     "taskId": "task-XXXXXXXX-NNN",
     "generatedAt": "ISO时间",
     "sourceFiles": ["chapters/.../draft.md"],
     "suggestions": [
       {
         "id": "sug-001",
         "type": "typo",
         "severity": "low",
         "file": "chapters/.../draft.md",
         "original": "原文片段",
         "replacement": "建议文本",
         "reason": "修改原因",
         "canAutoApply": true
       }
     ]
   }
   ```

5. **type 可选值**：typo, grammar, punctuation, repetition, logic, character, setting, power, pacing, emotion, suggestion
6. **severity 可选值**：critical, high, medium, low
7. **original 字段**必须是文件中能精确匹配到的文本片段

## 注意事项

- `suggestion` 类型的 `replacement` 可为空字符串（仅提示问题不替换）
- 如果没有任何问题，`suggestions` 数组可以为空
   - 生成完两个文件后，告知用户「审稿完成，请回到笔搭插件查看结果」
