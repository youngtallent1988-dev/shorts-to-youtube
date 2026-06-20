import os
import re
import sys
import google.generativeai as genai

# Configure from environment variable only (no hard-coded key)
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY environment variable is not set")

genai.configure(api_key=api_key)

def read_source_file(filepath: str) -> str:
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def fix_source_file(filepath: str, new_content: str) -> str:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    return f"🎉 Self-Healing complete! Automatically patched {filepath}."

def run_debugging_agent(error_message: str, target_file: str):
    current_code = read_source_file(target_file)
    
    prompt = f"""
    You are an expert autonomous self-healing software engineer.
    The local codebase crashed with this exact runtime exception: "{error_message}"
    
    Here is the complete contents of the file '{target_file}':
    ---
    {current_code}
    ---
    
    INSTRUCTIONS: Fix the bug immediately. Output the ENTIRE updated file contents. Do not include markdown code block syntax outside the code.
    """
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content(prompt)
    clean_code = re.sub(r'^```python\s*|^```\s*|```$', '', response.text, flags=re.MULTILINE).strip()
    
    print(fix_source_file(target_file, clean_code))

# This allows your backend terminal to pass errors into this script dynamically
if __name__ == "__main__":
    if len(sys.argv) > 2:
        run_debugging_agent(sys.argv[1], sys.argv[2])
    else:
        print("🤖 Self-Healing listening for backend triggers...")

