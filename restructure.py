import os
import shutil

os.makedirs('api', exist_ok=True)
os.makedirs('public/js', exist_ok=True)
os.makedirs('public/css', exist_ok=True)

if os.path.exists('backend/main.py'):
    shutil.move('backend/main.py', 'api/index.py')
if os.path.exists('backend/requirements.txt'):
    shutil.move('backend/requirements.txt', 'requirements.txt')
if os.path.exists('frontend/app.js'):
    shutil.move('frontend/app.js', 'public/js/app.js')
if os.path.exists('frontend/style.css'):
    shutil.move('frontend/style.css', 'public/css/style.css')
if os.path.exists('frontend/index.html'):
    shutil.move('frontend/index.html', 'public/index.html')

if os.path.exists('backend') and not os.listdir('backend'):
    os.rmdir('backend')
if os.path.exists('frontend') and not os.listdir('frontend'):
    os.rmdir('frontend')
