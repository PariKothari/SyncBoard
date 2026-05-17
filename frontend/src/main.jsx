import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap/dist/js/bootstrap.bundle.js"
import {BrowserRouter as Router} from "react-router-dom"
import ReactDOM from "react-dom"
import React from 'react'
ReactDOM.render(
  <Router>
    <App/>
  </Router>,
  document.getElementById("root")
)
