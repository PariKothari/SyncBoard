import { useState } from "react";
import "./index.css"
import WhiteBoard from "../../components/Whiteboard";

const RoomPage = () => {
  const[tool,setTool]=useState("pencil");
  const[color,setColor]=useState("black");
  
    return (
    <div className="row">
      <h1 className="text-center py-5">White Board Sharing App{" "} <span className="text-primary">[Users Online:0]</span></h1>
      <div className="col-md-10 mx-auto px-5 mb-3 d-flex align-items-center justify-content-center">
        <div className="d-flex col-md-2 justify-content-center gap-1">
            <div className="d-flex gap-1">
                <label htmlfor="pencil">Pencil</label>
            <input type="radio" name="tool" id="pencil" checked={tool==="pencil"} value="pencil" className="mt-1" onChange={(e)=>setTool(e.target.value)}/>
            </div>
            
            <div className="d-flex col-md-2 justify-content-center gap-1">
                <label htmlfor="line">Line</label>
            <input type="radio" name="tool" id="line" checked={tool==="line"} value="line" className="mt-1" onChange={(e)=>setTool(e.target.value)}/>
            </div>
           <div className="d-flex gap-1">
                <label htmlfor="rect">Rectangle</label>
            <input type="radio" name="tool" id="rect" checked={tool==="rect"}value="rect" className="mt-1" onChange={(e)=>setTool(e.target.value)}/>
            </div>
        </div>
        <div className="col-md-2 mx-auto">
            <div className="d-flex align-items-center">
                <label htmlFor="color">Select Color:</label>
                <input type="color" id="color" className="mt-1 ms-3" value={color} onChange={(e)=>setColor(e.target.value)}/>
            </div>

        </div>
        <div className="col-md-3 d-flex gap-1">
            <button className="btn btn-primary mt-1">Undo</button>
            <button className="btn btn-outline-primary mt-1">Redo</button>

        </div>
        <div className="col-md-2">
            <button className="btn btn-danger">Clear Canvas</button>
        </div>
      </div>
      <div className="col-md-10 mx-auto mt-4 canvas-box">
        <WhiteBoard/>

      </div>
    </div>
  )
}

export default RoomPage
