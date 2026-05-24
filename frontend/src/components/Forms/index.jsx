// frontend/src/components/Forms/index.jsx
import { useState } from "react";
import CreateRoomForm from "./CreateRoomForm";
import JoinRoomForm from "./JoinRoomForm";
import "./index.css";

const Forms = ({ uuid, socket, setUser }) => {
    const [activeTab, setActiveTab] = useState("create");

    return (
        <div className="saas-container">
            <div className="row align-items-center justify-content-center min-vh-100 py-5">
                
                {/* Left Column: Premium Brand & Feature Showcase */}
                <div className="col-lg-6 mb-5 mb-lg-0 text-start saas-hero-section">
                    <div className="saas-badge mb-4">
                        <span className="badge-dot"></span> Next-Gen Whiteboarding
                    </div>
                    
                    <h1 className="saas-title mb-3">
                        Collaborate with <br />
                        absolute clarity on <span className="gradient-text">SyncBoard</span>
                    </h1>
                    
                    <p className="saas-subtitle mb-5">
                        An interactive real-time workspace with built-in element locking, Mongoose-backed persistence, and automated AI assistance.
                    </p>
                    
                    <div className="saas-features">
                        
                        {/* Feature 1: Real-Time Collaboration */}
                        <div className="feature-item d-flex align-items-start mb-4">
                            <div className="feature-icon me-3">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </div>
                            <div>
                                <h5 className="feature-title mb-1">Real-Time Collaboration</h5>
                                <p className="feature-desc text-muted mb-0">
                                    Draw, sketch, and design together without the chaos. Built-in element locking ensures nobody accidentally edits the same shape at the same time.
                                </p>
                            </div>
                        </div>
                        
                        {/* Feature 2: AI-Powered Scribe */}
                        <div className="feature-item d-flex align-items-start mb-4">
                            <div className="feature-icon me-3">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                            </div>
                            <div>
                                <h5 className="feature-title mb-1">AI-Powered Scribe & Smart Architecture Review</h5>
                                <p className="feature-desc text-muted mb-0">
                                    Instant clarity for messy whiteboards. Let the AI summarize your team's meeting notes or critique your system architecture diagrams for bottlenecks.
                                </p>
                            </div>
                        </div>
                        
                        {/* Feature 3: Persistent State */}
                        <div className="feature-item d-flex align-items-start">
                            <div className="feature-icon me-3">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                                </svg>
                            </div>
                            <div>
                                <h5 className="feature-title mb-1">Persistent State & Zero Progress Lost</h5>
                                <p className="feature-desc text-muted mb-0">
                                    Don't worry about closed tabs or dropped connections. Every single coordinate and change syncs instantly to the backend for seamless session recovery.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Right Column: Console Control Panel */}
                <div className="col-lg-5 col-md-8">
                    <div className="saas-card shadow-lg p-4 p-md-5">
                        {/* Custom Tab Toggles */}
                        <div className="saas-tabs d-flex justify-content-center mb-4">
                            <button 
                                className={`saas-tab-btn ${activeTab === "create" ? "active" : ""}`}
                                onClick={() => setActiveTab("create")}
                            >
                                Create Room
                            </button>
                            <button 
                                className={`saas-tab-btn ${activeTab === "join" ? "active" : ""}`}
                                onClick={() => setActiveTab("join")}
                            >
                                Join Room
                            </button>
                        </div>

                        {/* Toggled Form Rendering */}
                        <div className="tab-content">
                            {activeTab === "create" ? (
                                <div>
                                    <div className="text-center mb-4">
                                        <h3 className="tab-title">Start a Session</h3>
                                        <p className="text-muted small">Generate a unique workspace room to collaborate with your team.</p>
                                    </div>
                                    <CreateRoomForm uuid={uuid} socket={socket} setUser={setUser} />
                                </div>
                            ) : (
                                <div>
                                    <div className="text-center mb-4">
                                        <h3 className="tab-title">Join a Session</h3>
                                        <p className="text-muted small">Enter your partner's workspace room code to begin drawing.</p>
                                    </div>
                                    <JoinRoomForm uuid={uuid} socket={socket} setUser={setUser} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Forms;