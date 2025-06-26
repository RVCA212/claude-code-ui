Thanks for clarifying. I’ll gather detailed and accurate JSON output schemas for each tool that can be used via the official Anthropic Claude Code SDK, especially when invoked with the `-p` flag and streaming JSON output. This will include a breakdown of each tool’s output format, fields, and data types.

I’ll let you know as soon as the documentation is ready.


# Anthropic Claude Code Tools JSON Output Schemas

## Bash Tool

**Description:** The Bash tool gives Claude the ability to execute shell commands in a persistent Bash session. It can run any command-line operation, maintain state between commands (remembering environment variables and working directory), and automate system tasks. This is useful for running build scripts, tests, file operations, etc., during a coding session.

**JSON Output Schema:** When used in streaming JSON mode, Claude’s response will include a `tool_use` block to invoke Bash and a corresponding `tool_result` with the execution output. The schema is as follows:

* **Invocation (`tool_use`):**

  * **type** (string): `"tool_use"` – Denotes a tool invocation event.
  * **id** (string): Unique identifier for this tool call (e.g. `"toolu_..."`).
  * **name** (string): `"bash"` – The name of the tool.
  * **input** (object): Parameters for the Bash command. Contains:

    * **command** (string): The shell command to run (required).
    * **restart** (boolean): If `true`, restarts the Bash session (optional).

* **Result (`tool_result`):**

  * **type** (string): `"tool_result"` – Marks the result of a tool execution.
  * **tool\_use\_id** (string): References the `id` of the corresponding `tool_use`.
  * **content** (string): The combined output of the command’s stdout and stderr. Large outputs may be truncated with an indicator to avoid exceeding token limits.
  * **is\_error** (boolean, optional): Present and set to `true` if the command failed or produced an error. In such cases, **content** will contain an error message. If the command executed successfully, this field may be omitted or `false`, and **content** contains the command output.

**Example JSON output:** Below is an example of Claude invoking the Bash tool to list files, and the subsequent result with the command’s output. This would appear as two JSON messages in the streaming output: one for the tool use and one for the tool result.

```json
{ 
  "type": "tool_use",
  "id": "toolu_ABC123",
  "name": "bash",
  "input": { "command": "ls -la" }
}
{ 
  "type": "tool_result",
  "tool_use_id": "toolu_ABC123",
  "content": "total 32\ndrwxr-xr-x  5 user user 4096 Oct 10 12:00 .\ndrwxr-xr-x  3 user user 4096 Oct 10 11:58 ..\n-rw-r--r--  1 user user   23 Oct 10 12:00 file1.txt\n...",
  "is_error": false
}
```

**Sources:** Bash tool overview and parameters; output truncation note.

## Code Execution Tool

**Description:** The Code Execution tool allows Claude to run Python code in a secure, sandboxed environment. Claude will decide when writing and executing code can help answer the user’s request (for example, performing calculations, data analysis, or generating charts). This tool runs code on Anthropic’s servers and returns the results (or errors) back to Claude.

**JSON Output Schema:** With streaming JSON enabled, Claude’s response will include a `server_tool_use` block when invoking code execution, followed by a `code_execution_tool_result` block containing the execution outcome. Key fields include:

* **Invocation (`server_tool_use`):**

  * **type** (string): `"server_tool_use"` – Indicates a server-side tool invocation (Anthropic-hosted tool).
  * **id** (string): Unique identifier for this tool call (e.g. `"srvtoolu_..."`).
  * **name** (string): `"code_execution"` – The tool name.
  * **input** (object): Parameters for code execution. Contains:

    * **code** (string): The Python code to execute. Claude will generate this code snippet and it is passed as the input. *(No other input fields are required for this tool.)*

* **Result (`code_execution_tool_result`):**

  * **type** (string): `"code_execution_tool_result"` – Indicates the result of a code execution call.

  * **tool\_use\_id** (string): References the `id` of the corresponding `server_tool_use`.

  * **content** (object): An object describing the execution result. Typically this object has:

    * **type** (string): `"code_execution_result"` if execution succeeded (or `"code_execution_tool_result_error"` if a tool failure occurred).
    * **stdout** (string): Captured standard output from the code (e.g. printed results).
    * **stderr** (string): Captured standard error output (e.g. error trace if the code threw an exception).
    * **return\_code** (number): The exit code of the Python process (0 for success, non-zero if an error occurred in the code).

  * If the tool itself fails to run or is unavailable, **content** will instead contain a minimal error object:

    * **type**: `"code_execution_tool_result_error"` and **error\_code** (string) indicating the reason (e.g. `"unavailable"` if the execution service is down, `"code_execution_exceeded"` if runtime limits exceeded, etc.).

**Example JSON output:** Below is an example where Claude uses the Code Execution tool to compute statistics on a list of numbers. The assistant first issues the code to run, and then the result (stdout and return code) is returned:

```json
{ 
  "type": "server_tool_use",
  "id": "srvtoolu_XYZ456",
  "name": "code_execution",
  "input": {
    "code": "import numpy as np\ndata = [1,2,3,4,5,6,7,8,9,10]\nprint('Mean:', np.mean(data))\nprint('Std:', np.std(data))"
  }
}
{ 
  "type": "code_execution_tool_result",
  "tool_use_id": "srvtoolu_XYZ456",
  "content": {
    "type": "code_execution_result",
    "stdout": "Mean: 5.5\nStd: 2.8722813232690143\n",
    "stderr": "",
    "return_code": 0
  }
}
```

In case of an error (for example, if the code had undefined variables), the `stderr` would contain the Python error message and `return_code` would be non-zero. If the code execution environment itself is unavailable, Claude would return a `code_execution_tool_result` with an `"error_code"` (such as `"unavailable"`) instead of stdout/stderr.

**Sources:** Code execution tool description; example of tool invocation and result schema; result fields and error handling.

## Computer Use Tool

**Description:** The Computer Use tool enables Claude to simulate user actions in a graphical desktop environment – taking screenshots, moving the mouse, clicking, typing, etc.. This tool is in beta and allows Claude to autonomously interact with a virtual desktop, which can be useful for tasks like opening applications, navigating interfaces, or other GUI automation. (Developers must implement these actions on their system and feed results back to Claude, since Claude itself cannot directly manipulate the OS.)

**JSON Output Schema:** In streaming JSON, Claude will produce one or more `tool_use` blocks each representing a GUI action, followed by corresponding `tool_result` blocks that carry the outcome (like screenshots or confirmation/error messages). The schema for each action is:

* **Invocation (`tool_use`):**

  * **type** (string): `"tool_use"` – A client-side tool invocation.
  * **id** (string): Unique ID for this action (e.g. `"toolu_..."`).
  * **name** (string): `"computer"` – Name of the computer-use tool.
  * **input** (object): Parameters for the requested GUI action. It always includes:

    * **action** (string): The type of action to perform. Supported actions include *“screenshot”* (capture the screen), *“left\_click”* (click at specific coordinates), *“right\_click”*, \*“double\_click” (etc.), *“mouse\_move”*, *“type”* (type text), *“key”* (press a key or shortcut), *“scroll”*, *“wait”*, and more.
    * Additional fields depending on the action:

      * **coordinate** (array of two integers): Required for cursor movements and clicks – specifies the `[x, y]` screen coordinates for actions like `"mouse_move"` or `"left_click"`.
      * **text** (string): The text to input for a `"type"` action.
      * **scroll\_direction** (string) and **scroll\_amount** (number): For a `"scroll"` action – e.g. `"scroll_direction": "down", "scroll_amount": 3` to scroll down by 3 units.
      * **key** (string): For a `"key"` action to press a specific key or key combination (e.g. `"ctrl+s"` for save).
        *(Other action-specific fields exist for advanced use, such as drag coordinates for drag-and-drop, but the above are the most common.)*

* **Result (`tool_result`):**

  * **type** (string): `"tool_result"` – The result of executing a GUI action.
  * **tool\_use\_id** (string): References the `id` of the action it corresponds to.
  * **content** (string): The outcome of the action. For a **screenshot**, this might be a description or an image attachment (the actual screenshot would typically be uploaded and referenced). For other actions, this could be a confirmation message or any textual result from the environment. If the action did not produce notable output, Claude might leave this as a brief acknowledgement or even an empty string.
  * **is\_error** (boolean, optional): Present and `true` if the action failed to execute. In error cases, **content** will contain an error message describing what went wrong. If `is_error` is not present or `false`, the action is assumed to have succeeded.

**Example JSON output:** Suppose Claude tries to click at a location that is outside the visible screen bounds. It would emit a tool use for the click, and your system would respond with an error result. For example:

```json
{ 
  "type": "tool_use",
  "id": "toolu_789XYZ",
  "name": "computer",
  "input": { 
    "action": "left_click",
    "coordinate": [1200, 900] 
  }
}
{ 
  "type": "tool_result",
  "tool_use_id": "toolu_789XYZ",
  "content": "Error: Coordinates (1200, 900) are outside display bounds (1024x768).",
  "is_error": true
}
```

In the above example, the click action failed because the coordinates were beyond the 1024×768 screen size, so the tool result contains an error message and `is_error: true`. If the action had succeeded (e.g. moving the mouse or typing text), the result might simply confirm the action with no error flag. For a screenshot action, the **content** could include a reference to the captured image (for instance, an uploaded file ID or a data URL, depending on implementation).

**Sources:** Computer use tool overview; list of supported actions and parameters; example of JSON actions and error result.

## Text Editor Tool

**Description:** The Text Editor tool allows Claude to open, view, and modify text files in the user’s workspace. This tool is designed for tasks like reading code or logs, creating new files, inserting or deleting lines, and performing find-and-replace operations in files. By using the text editor, Claude can apply changes to files directly (under the hood, this typically calls an external editor program or API provided by the developer).

**JSON Output Schema:** In streaming JSON mode, an edit operation is represented by a `tool_use` block (specifying what file operation to perform) followed by a `tool_result` block with the outcome or file content. The schema is:

* **Invocation (`tool_use`):**

  * **type** (string): `"tool_use"` – Denotes a client tool invocation.
  * **id** (string): Unique identifier for this tool call (e.g. `"toolu_..."`).
  * **name** (string): Name of the text editor tool. For Claude 4 models this is `"str_replace_based_edit_tool"` (for Claude 3.7/3.5 it may appear as `"str_replace_editor"`, which is an earlier version name).
  * **input** (object): Parameters describing the file operation. Key fields include:

    * **command** (string): The operation to perform on the file. Supported commands include:

      * `"view"` – Read a file (or list a directory) and return its contents.
      * `"create"` – Create a new file with given text content.
      * `"str_replace"` – Find and replace a string in a file.
      * `"insert"` – Insert text at a specified line number in a file.
      * `"delete"` – Remove a range of lines from a file (line range specified).
      * `"undo_edit"` – (Deprecated in newer versions) Undo the last edit (in Claude 3.7’s tool).
    * **path** (string): The filesystem path to the target file (or directory for a view command on a folder).
    * Additional fields depending on the command:

      * For `"view"`: optionally **view\_range** (array of two ints) to limit which lines to fetch, or **max\_depth** for directory listing depth.
      * For `"create"`: **file\_text** (string) containing the content to put in the new file.
      * For `"str_replace"`: **old\_str** (string, the text to find) and **new\_str** (string, the replacement text). Optional flags **allow\_multi** (boolean, replace all occurrences or just first) and **use\_regex** (boolean, treat old\_str as a regex) may also appear.
      * For `"insert"`: **insert\_line** (integer, the line number at which to insert) and **new\_str** (the text to insert).
      * For `"delete"`: **delete\_range** (array of two ints, the start and end line numbers to delete).

    *(All required and optional fields for each command are defined by the tool’s JSON schema. Claude will include the appropriate fields for the command it chooses.)*

* **Result (`tool_result`):**

  * **type** (string): `"tool_result"` – The outcome of the file operation.
  * **tool\_use\_id** (string): References the `id` of the corresponding `tool_use` invocation.
  * **content** (string): The result of the operation. For a `"view"` command, this will contain the file’s content (often with line numbers prefixed for readability). For modification commands (`create`, `insert`, `delete`, `str_replace`), this may contain a brief confirmation or the new content of the file. For example, Claude might return the updated lines or a message like “Inserted text at line 5” or a diff.
  * **is\_error** (boolean, optional): Present and `true` if the file operation failed. On error, **content** will contain an error message explaining the failure (e.g. “Error: file not found” or permission issues). If not present or `false`, the operation is considered successful.

**Example JSON output:** Below is an example where Claude uses the text editor tool to view a file and then perform a string replacement. The first `tool_use` asks to view a file, and the result returns the file’s content with line numbers. The second `tool_use` requests a replacement, and the result confirms the change:

```json
{ 
  "type": "tool_use",
  "id": "toolu_File1",
  "name": "str_replace_based_edit_tool",
  "input": { 
    "command": "view",
    "path": "primes.py" 
  }
}
{ 
  "type": "tool_result",
  "tool_use_id": "toolu_File1",
  "content": "1\tdef is_prime(n):\n2\t    # check if n is prime...\n3\t    for num in range(2, n):\n4\t        if n % num == 0:\n5\t            return False\n..."
}
{ 
  "type": "tool_use",
  "id": "toolu_File2",
  "name": "str_replace_based_edit_tool",
  "input": { 
    "command": "str_replace",
    "path": "primes.py",
    "old_str": "for num in range(2, n)",
    "new_str": "for num in range(2, n):"
  }
}
{ 
  "type": "tool_result",
  "tool_use_id": "toolu_File2",
  "content": "Replaced 1 occurrence of the pattern in primes.py."
}
```

In this example, the first result shows the contents of *primes.py* with each line numbered (as returned by the view command). The second result indicates a successful replacement of a missing colon in the loop (with a confirmation message). If an error had occurred (for instance, if the file path was invalid), the `tool_result` would include an error message and `is_error: true`.

**Sources:** Text editor tool description; input schema and command fields; output format and error flag.

## Web Search Tool

**Description:** The Web Search tool gives Claude access to real-time web information beyond its training data. When enabled, Claude can perform internet searches and read content from web pages. It will use this tool to fetch up-to-date knowledge (for example, latest documentation or news) and incorporate the findings into its answer with citations. Web search is executed on Anthropic’s servers (no client implementation needed) and is rate-limited and domain-filterable for safety.

**JSON Output Schema:** In streaming mode, a web search is represented by a `server_tool_use` block when Claude decides to search, followed by a `web_search_tool_result` containing the search results. The structure is:

* **Invocation (`server_tool_use`):**

  * **type** (string): `"server_tool_use"` – Indicates a server-side tool invocation.
  * **id** (string): Unique ID for the search action (e.g. `"srvtoolu_..."`).
  * **name** (string): `"web_search"` – The web search tool’s name.
  * **input** (object): Parameters for the search query. Contains:

    * **query** (string): The search query string that Claude wants to look up. *(Optional parameters like allowed domains or location may be included if specified in the tool configuration, but typically Claude provides just a query.)*

* **Result (`web_search_tool_result`):**

  * **type** (string): `"web_search_tool_result"` – Denotes the search results returned.
  * **tool\_use\_id** (string): References the `id` of the corresponding `server_tool_use`.
  * **content** (array): A list of search results, where each item is a **web\_search\_result** object with the following fields:

    * **type** (string): `"web_search_result"` – Identifies this object as a single search result entry.
    * **title** (string): The title of the webpage or result.
    * **url** (string): The URL of the webpage.
    * **encrypted\_content** (string): An encrypted snippet of the page’s content. This is a ciphered version of the page text that Claude can use to extract information without exposing the raw content directly. (The encrypted content is used internally by Claude to reason about the page, while keeping the actual text secure.)
    * **page\_age** (number or null): The age of the page content if available (e.g. how recent it is). If not provided by the search engine, this may be `null`.

  The `web_search_tool_result` content array may include multiple `web_search_result` entries (up to the maximum number of results Claude is allowed to fetch). Claude will then read these results and typically follow up by citing relevant URLs in its final answer.

**Example JSON output:** Below is a simplified example of Claude performing a web search. It issues a search query and receives one result (for brevity, only one result is shown here):

```json
{ 
  "type": "server_tool_use",
  "id": "srvtoolu_ABC999",
  "name": "web_search",
  "input": { 
    "query": "TypeScript 5.5 update migration guide web app"
  }
}
{ 
  "type": "web_search_tool_result",
  "tool_use_id": "srvtoolu_ABC999",
  "content": [
    {
      "type": "web_search_result",
      "title": "A Comprehensive Guide to TypeScript Migration from Version 4 to 5",
      "url": "https://www.webdevtutor.net/blog/typescript-migration-4-to-5",
      "encrypted_content": "EtAMC...Aw==",
      "page_age": null
    }
  ]
}
```

In this example, Claude’s query returns a single result with a title and URL relevant to the question. The `encrypted_content` field contains a long encrypted string (truncated here) representing the page’s text content. In practice, multiple results would be listed. Claude will use these results to formulate its answer, often quoting or summarizing them with citations.

**Sources:** Web search tool usage and definition; example JSON structure of search invocation and results.
