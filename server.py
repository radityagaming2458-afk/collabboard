import os
import json
import uuid
import time
import secrets
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from cryptography.fernet import Fernet

app = FastAPI(title="CollabBoard Server with Encrypted Links")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent Secret Key for Fernet symmetric encryption
KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".secret_key")
if os.path.exists(KEY_FILE):
    with open(KEY_FILE, "rb") as f:
        SECRET_KEY = f.read().strip()
else:
    SECRET_KEY = Fernet.generate_key()
    with open(KEY_FILE, "wb") as f:
        f.write(SECRET_KEY)

cipher = Fernet(SECRET_KEY)

def generate_encrypted_token(room_id: str, role: str) -> str:
    payload = {
        "room": room_id,
        "role": role,
        "ts": int(time.time()),
        "salt": secrets.token_hex(4)
    }
    raw = json.dumps(payload).encode("utf-8")
    return cipher.encrypt(raw).decode("utf-8")

def decrypt_token(token: str) -> Optional[dict]:
    try:
        raw = cipher.decrypt(token.encode("utf-8"))
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


# Room state
class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.slides: List[Dict[str, Any]] = [
            {
                "id": "slide-1",
                "elements": [],
                "redo_stack": []
            }
        ]
        self.current_slide_idx: int = 0
        self.background: Dict[str, Any] = {
            "type": "grid",
            "color": "#1e293b",
            "patternColor": "#334155",
            "gridSize": 26,
            "image": None
        }
        self.connections: Dict[WebSocket, Dict[str, Any]] = {}

    @property
    def elements(self) -> List[Dict[str, Any]]:
        if not self.slides:
            self.slides = [{"id": "slide-1", "elements": [], "redo_stack": []}]
        if self.current_slide_idx >= len(self.slides):
            self.current_slide_idx = len(self.slides) - 1
        return self.slides[self.current_slide_idx]["elements"]

    @elements.setter
    def elements(self, val: List[Dict[str, Any]]):
        if not self.slides:
            self.slides = [{"id": "slide-1", "elements": [], "redo_stack": []}]
        if self.current_slide_idx >= len(self.slides):
            self.current_slide_idx = len(self.slides) - 1
        self.slides[self.current_slide_idx]["elements"] = val

    @property
    def redo_stack(self) -> List[Dict[str, Any]]:
        if not self.slides:
            self.slides = [{"id": "slide-1", "elements": [], "redo_stack": []}]
        if self.current_slide_idx >= len(self.slides):
            self.current_slide_idx = len(self.slides) - 1
        return self.slides[self.current_slide_idx]["redo_stack"]

    @redo_stack.setter
    def redo_stack(self, val: List[Dict[str, Any]]):
        if not self.slides:
            self.slides = [{"id": "slide-1", "elements": [], "redo_stack": []}]
        if self.current_slide_idx >= len(self.slides):
            self.current_slide_idx = len(self.slides) - 1
        self.slides[self.current_slide_idx]["redo_stack"] = val

    def get_user_list(self):
        return [
            {
                "userId": info["user_id"],
                "name": info["name"],
                "color": info["color"],
                "role": info["role"],
                "isHost": info.get("is_host", False)
            }
            for info in self.connections.values()
        ]

    async def broadcast(self, message: dict, sender: WebSocket = None):
        msg_json = json.dumps(message)
        dead_sockets = []
        for ws in self.connections.keys():
            if ws != sender:
                try:
                    await ws.send_text(msg_json)
                except Exception:
                    dead_sockets.append(ws)
        for ws in dead_sockets:
            if ws in self.connections:
                del self.connections[ws]

    async def broadcast_all(self, message: dict):
        await self.broadcast(message, sender=None)


rooms: Dict[str, Room] = {}

def get_or_create_room(room_id: str) -> Room:
    if room_id not in rooms:
        rooms[room_id] = Room(room_id)
    return rooms[room_id]


# API: Generate encrypted invite links for editor & viewer
@app.get("/api/invite/tokens")
async def get_invite_tokens(room: str = Query(...)):
    if not room:
        raise HTTPException(status_code=400, detail="Missing room parameter")
    
    editor_token = generate_encrypted_token(room, "editor")
    viewer_token = generate_encrypted_token(room, "viewer")

    return {
        "room": room,
        "editor_token": editor_token,
        "viewer_token": viewer_token
    }


# API: Resolve encrypted token to room & role
@app.get("/api/invite/resolve")
async def resolve_invite(token: str = Query(...)):
    payload = decrypt_token(token)
    if not payload:
        return {"valid": False, "error": "Token enkripsi tidak valid atau telah dimodifikasi"}
    return {
        "valid": True,
        "room": payload.get("room"),
        "role": payload.get("role")
    }


@app.get("/api/rooms/{room_id}/status")
async def get_room_status(room_id: str):
    room = rooms.get(room_id)
    if not room:
        return {"exists": False, "users": 0}
    return {
        "exists": True,
        "users": len(room.connections),
        "slides": len(room.slides),
        "currentSlide": room.current_slide_idx,
        "elements": len(room.elements),
        "background": room.background
    }


# WebSocket endpoint with cryptographic role validation
@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    name: str = Query("Guest"),
    token: Optional[str] = Query(None),
    role: str = Query("viewer"),
    color: str = Query("#3b82f6")
):
    await websocket.accept()

    # Determine role cryptographically:
    final_role = "viewer"
    
    if token:
        decrypted = decrypt_token(token)
        if decrypted and decrypted.get("room") == room_id:
            final_role = decrypted.get("role", "viewer")
        else:
            final_role = "viewer"
    else:
        # If no token is provided:
        # First visitor to create a new room gets editor, subsequent unauthenticated visitors default to viewer
        if room_id not in rooms:
            final_role = "editor"
        else:
            final_role = "viewer"

    room = get_or_create_room(room_id)
    is_first_user = (len(room.connections) == 0)
    user_id = str(uuid.uuid4())[:8]

    user_info = {
        "user_id": user_id,
        "name": name.strip() or "Guest",
        "color": color,
        "role": final_role,
        "is_host": is_first_user
    }
    room.connections[websocket] = user_info

    # Send initial state
    init_payload = {
        "type": "init",
        "user": user_info,
        "background": room.background,
        "elements": room.elements,
        "currentSlideIndex": room.current_slide_idx,
        "slidesCount": len(room.slides),
        "users": room.get_user_list()
    }
    await websocket.send_text(json.dumps(init_payload))

    # Broadcast join
    await room.broadcast({
        "type": "user_joined",
        "user": user_info,
        "users": room.get_user_list()
    }, sender=websocket)

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            action_type = data.get("type")

            # Enforce Editor permissions
            is_editor = (user_info["role"] == "editor")

            if action_type == "cursor":
                await room.broadcast({
                    "type": "cursor",
                    "userId": user_id,
                    "name": user_info["name"],
                    "color": user_info["color"],
                    "x": data.get("x", 0),
                    "y": data.get("y", 0)
                }, sender=websocket)

            elif action_type == "draw_live":
                if not is_editor:
                    continue
                await room.broadcast({
                    "type": "draw_live",
                    "userId": user_id,
                    "strokeId": data.get("strokeId"),
                    "points": data.get("points"),
                    "color": data.get("color"),
                    "size": data.get("size"),
                    "tool": data.get("tool")
                }, sender=websocket)

            elif action_type == "element_add":
                if not is_editor:
                    continue
                element = data.get("element")
                if element:
                    element["createdBy"] = user_id
                    room.elements.append(element)
                    room.redo_stack.clear()
                    await room.broadcast({
                        "type": "element_add",
                        "element": element
                    }, sender=websocket)

            elif action_type == "element_update":
                if not is_editor:
                    continue
                element = data.get("element")
                elem_id = element.get("id") if element else None
                if elem_id:
                    for i, el in enumerate(room.elements):
                        if el.get("id") == elem_id:
                            room.elements[i] = element
                            break
                    await room.broadcast({
                        "type": "element_update",
                        "element": element
                    }, sender=websocket)

            elif action_type == "element_delete":
                if not is_editor:
                    continue
                elem_id = data.get("id")
                if elem_id:
                    deleted_item = next((el for el in room.elements if el.get("id") == elem_id), None)
                    if deleted_item:
                        room.elements = [el for el in room.elements if el.get("id") != elem_id]
                        room.redo_stack.append(deleted_item)
                        await room.broadcast_all({
                            "type": "element_delete",
                            "id": elem_id
                        })

            elif action_type == "undo":
                if not is_editor:
                    continue
                if room.elements:
                    popped = room.elements.pop()
                    room.redo_stack.append(popped)
                    await room.broadcast_all({
                        "type": "sync_elements",
                        "elements": room.elements
                    })

            elif action_type == "redo":
                if not is_editor:
                    continue
                if room.redo_stack:
                    restored = room.redo_stack.pop()
                    room.elements.append(restored)
                    await room.broadcast_all({
                        "type": "sync_elements",
                        "elements": room.elements
                    })

            elif action_type == "clear":
                if not is_editor:
                    continue
                if room.elements:
                    room.redo_stack = list(room.elements)
                    room.elements = []
                    await room.broadcast_all({
                        "type": "clear"
                    })

            elif action_type == "clear_text_only":
                if not is_editor:
                    continue
                text_elements = [el for el in room.elements if el.get("tool") == "text"]
                if text_elements:
                    room.redo_stack.extend(text_elements)
                    room.elements = [el for el in room.elements if el.get("tool") != "text"]
                    await room.broadcast_all({
                        "type": "sync_elements",
                        "elements": room.elements
                    })

            elif action_type == "set_background":
                if not is_editor:
                    continue
                bg_data = data.get("background", {})
                room.background.update(bg_data)
                await room.broadcast_all({
                    "type": "background_changed",
                    "background": room.background
                })

            elif action_type == "chat":
                msg_text = str(data.get("message", "")).strip()
                if msg_text:
                    await room.broadcast_all({
                        "type": "chat",
                        "userId": user_id,
                        "name": user_info["name"],
                        "color": user_info["color"],
                        "message": msg_text[:300]
                    })

            elif action_type == "change_name":
                new_name = str(data.get("name", "")).strip()[:24]
                new_color = str(data.get("color", "")).strip()
                if new_name:
                    user_info["name"] = new_name
                if new_color.startswith("#"):
                    user_info["color"] = new_color
                await room.broadcast_all({
                    "type": "users_updated",
                    "users": room.get_user_list()
                })

            elif action_type == "change_user_role":
                if not is_editor:
                    continue
                target_id = data.get("targetUserId")
                new_role = data.get("role")
                if target_id and new_role in ("editor", "viewer"):
                    role_changed = False
                    for target_ws, info in list(room.connections.items()):
                        if info["user_id"] == target_id:
                            # Host tidak dapat diubah menjadi viewer
                            if info.get("is_host", False) and new_role == "viewer":
                                try:
                                    await websocket.send_text(json.dumps({
                                        "type": "error",
                                        "message": "Host tidak dapat diubah menjadi Viewer!"
                                    }))
                                except Exception:
                                    pass
                                break

                            info["role"] = new_role
                            role_changed = True
                            try:
                                await target_ws.send_text(json.dumps({
                                    "type": "role_changed_by_admin",
                                    "newRole": new_role,
                                    "changedBy": user_info["name"]
                                }))
                            except Exception:
                                pass
                            break
                    if role_changed:
                        await room.broadcast_all({
                            "type": "users_updated",
                            "users": room.get_user_list()
                        })

            elif action_type == "kick_user":
                if not is_editor:
                    continue
                target_id = data.get("targetUserId")
                if target_id and target_id != user_id:
                    for target_ws, info in list(room.connections.items()):
                        if info["user_id"] == target_id:
                            if info.get("is_host", False):
                                try:
                                    await websocket.send_text(json.dumps({
                                        "type": "error",
                                        "message": "Host tidak dapat dikeluarkan dari ruangan!"
                                    }))
                                except Exception:
                                    pass
                                break

                            target_name = info["name"]
                            try:
                                await target_ws.send_text(json.dumps({
                                    "type": "kicked",
                                    "message": f"Anda telah dikeluarkan dari ruangan oleh {user_info['name']}."
                                }))
                                await target_ws.close()
                            except Exception:
                                pass

                            if target_ws in room.connections:
                                del room.connections[target_ws]

                            await room.broadcast_all({
                                "type": "user_left",
                                "userId": target_id,
                                "users": room.get_user_list(),
                                "kicked": True,
                                "name": target_name,
                                "by": user_info["name"]
                            })
                            break

            elif action_type == "change_slide":
                idx = int(data.get("index", 0))
                if 0 <= idx < len(room.slides):
                    room.current_slide_idx = idx
                    await room.broadcast_all({
                        "type": "slide_changed",
                        "slideIndex": room.current_slide_idx,
                        "slidesCount": len(room.slides),
                        "elements": room.elements,
                        "changedBy": user_info["name"]
                    })

            elif action_type == "add_slide":
                if not is_editor:
                    continue
                new_slide = {
                    "id": f"slide-{len(room.slides) + 1}-{uuid.uuid4().hex[:4]}",
                    "elements": [],
                    "redo_stack": []
                }
                room.slides.append(new_slide)
                room.current_slide_idx = len(room.slides) - 1
                await room.broadcast_all({
                    "type": "slide_added",
                    "slideIndex": room.current_slide_idx,
                    "slidesCount": len(room.slides),
                    "elements": room.elements,
                    "changedBy": user_info["name"]
                })

            elif action_type == "delete_slide":
                if not is_editor:
                    continue
                idx = int(data.get("index", room.current_slide_idx))
                if len(room.slides) > 1 and 0 <= idx < len(room.slides):
                    room.slides.pop(idx)
                    if room.current_slide_idx >= len(room.slides):
                        room.current_slide_idx = len(room.slides) - 1
                    await room.broadcast_all({
                        "type": "slide_deleted",
                        "slideIndex": room.current_slide_idx,
                        "slidesCount": len(room.slides),
                        "elements": room.elements,
                        "changedBy": user_info["name"]
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Error handling websocket: {e}")
    finally:
        if websocket in room.connections:
            del room.connections[websocket]
        await room.broadcast({
            "type": "user_left",
            "userId": user_id,
            "users": room.get_user_list()
        })


# Static files
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

@app.get("/")
async def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/join")
async def join_route():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/room/{room_id}")
async def room_view(room_id: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
