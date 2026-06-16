import google.generativeai as genai

# Delete the placeholder below and paste your brand-new AIzaSy sandbox key inside the quotes
FRESH_SANDBOX_KEY = "AIzaSyYourNewKeyHere"

# Initialize the library by passing the string variable directly
genai.configure(api_key=FRESH_SANDBOX_KEY)

print("🤖 Terminal connected! Pinging Google AI Studio sandbox...")

try:
    # Initialize the lightweight stable model
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    # Request text generation
    response = model.generate_content('Say hello!')
    
    print("\n🚀 Agent Response Success:")
    print(response.text)

except Exception as e:
    print("\n❌ Connection Failed:")
    print(str(e))
