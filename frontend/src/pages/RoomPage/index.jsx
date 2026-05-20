import { useState, useRef } from "react";
import "./index.css";
import WhiteBoard from "../../components/Whiteboard";

const RoomPage = () => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#000000");
  // 1. Added the missing elements state here
  const [elements, setElements] = useState([]);
  const [history,setHistory]=useState([]);
  const handleClearCanvas=()=>{
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    ctx.fillRect="white";
    ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);


    setElements([]);
  }

  const undo=()=>{
    setHistory((prevHistory)=>[...prevHistory,elements[elements.length-1]]);
    setElements(
      (prevElements)=>prevElements.slice(0,prevElements.length-1)
    )
  }
  const redo=()=>{
     setElements((prevElements)=>[...prevElements,history[history.length-1]]);
    setHistory(
      (prevHistory)=>prevHistory.slice(0,prevHistory.length-1)
    )

  }

  return (
    // container-fluid spans the full width, vh-100 locks the height to the viewport, overflow-hidden stops scrolling
    <div className="container-fluid vh-100 d-flex flex-column overflow-hidden bg-light px-4">
      
      {/* 1. Header Section */}
      <h2 className="text-center py-3 my-0 fw-semibold fs-4">
        White Board Sharing App{" "}
        <span className="text-primary fs-5">[Users Online: 0]</span>
      </h2>

      {/* 2. Tool Control Bar */}
      <div className="d-flex align-items-center justify-content-between border p-3 rounded shadow-sm bg-white mb-3">
        
        {/* Tool Selection (Radio Buttons) */}
        <div className="d-flex align-items-center gap-3 col-md-4">
          <div className="form-check d-flex align-items-center gap-1 mb-0">
            <input
              type="radio"
              name="tool"
              id="pencil"
              checked={tool === "pencil"}
              value="pencil"
              className="form-check-input m-0"
              onChange={(e) => setTool(e.target.value)}
            />
            <label htmlFor="pencil" className="form-check-label ms-1 m-0">Pencil</label>
          </div>

          <div className="form-check d-flex align-items-center gap-1 mb-0">
            <input
              type="radio"
              name="tool"
              id="line"
              checked={tool === "line"}
              value="line"
              className="form-check-input m-0"
              onChange={(e) => setTool(e.target.value)}
            />
            <label htmlFor="line" className="form-check-label ms-1 m-0">Line</label>
          </div>

          <div className="form-check d-flex align-items-center gap-1 mb-0">
            <input
              type="radio"
              name="tool"
              id="rect"
              checked={tool === "rect"}
              value="rect"
              className="form-check-input m-0"
              onChange={(e) => setTool(e.target.value)}
            />
            <label htmlFor="rect" className="form-check-label ms-1 m-0">Rectangle</label>
          </div>
        </div>

        {/* Color Picker */}
        <div className="col-md-3 d-flex align-items-center justify-content-center">
          <label htmlFor="color" className="fw-bold m-0">Select Color:</label>
          <input
            type="color"
            id="color"
            className="form-control-color ms-2"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>

        {/* Undo/Redo Controls */}
        <div className="col-md-3 d-flex gap-2 justify-content-center">
          <button className="btn btn-primary w-100" disabled={elements.length===0} onClick={()=>undo()}>Undo</button>
          <button className="btn btn-outline-primary w-100" disabled={history.length<1} onClick={()=>redo()}>Redo</button>
        </div>

        {/* Management Action */}
        <div className="col-md-2 d-flex justify-content-end">
          <button className="btn btn-danger w-100" onClick={handleClearCanvas} >Clear Canvas</button>
        </div>
      </div>

      {/* 3. The Interactive Whiteboard Component */}
      {/* flex-grow-1 ensures this section automatically occupies all the remaining vertical space down to the screen edge */}
      <div className="flex-grow-1 w-100 mb-4 canvas-box bg-white border rounded shadow-sm overflow-hidden position-relative">
        {/* 2. Passed elements and setElements as props here */}
        <WhiteBoard 
          canvasRef={canvasRef} 
          ctxRef={ctxRef} 
          elements={elements} 
          color={color}
          setElements={setElements} 
          tool={tool}
        />
      </div>

    </div>
  );
};

export default RoomPage;