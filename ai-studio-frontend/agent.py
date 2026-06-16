import warnings
# Silence the legacy package warnings so your terminal stays clean
warnings.filterwarnings("ignore", category=FutureWarning)

import os

import google.generativeai as genai

# Read your sandbox key from an environment variable instead of hard-coding it
FRESH_SANDBOX_KEY = os.environ.get("GEMINI_SANDBOX_KEY", "")

if not FRESH_SANDBOX_KEY:
    raise RuntimeError(
        "Missing GEMINI_SANDBOX_KEY environment variable. "
        "Set it to your Google AI Studio sandbox key before running agent.py."
    )

genai.configure(api_key=FRESH_SANDBOX_KEY)

print("🤖 Terminal connected! Pinging Google AI Studio sandbox...")

try:
    # Swapping to gemini-2.5-flash fixes the 404 URL route issue on Python 3.11/3.13
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # Request a quick confirmation response
    response = model.generate_content('Say hello!')
    
    print("\n🚀 Agent Response Success:")
    print(response.text)

except Exception as e:
    print("\n❌ Connection Failed:")
    print(str(e))
