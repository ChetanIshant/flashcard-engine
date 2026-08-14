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



#
