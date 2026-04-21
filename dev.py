import uvicorn
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from api.index import app

# Mount static directories for local development
app.mount("/css", StaticFiles(directory="public/css"), name="css")
app.mount("/js", StaticFiles(directory="public/js"), name="js")

@app.get("/")
async def root():
    return FileResponse("public/index.html")

if __name__ == "__main__":
    print("Running Flashcard Engine locally at http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
