import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Bienvenida from './pages/bienvenida.jsx';
import Inicio from './pages/inicio.jsx';
import DetalleSubasta from './pages/detalle-subasta.jsx';
import PublicarCarro from './pages/publicar-carro.jsx';
import Historial from './pages/historial.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';

function withLayout(component) {
  return (
    <ProtectedRoute>
      <AppLayout>{component}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Bienvenida />} />
        <Route path="/inicio" element={withLayout(<Inicio />)} />
        <Route path="/detalle-subasta/:id" element={withLayout(<DetalleSubasta />)} />
        <Route path="/publicar-carro" element={withLayout(<PublicarCarro />)} />
        <Route path="/historial" element={withLayout(<Historial />)} />
      </Routes>
    </Router>
  );
}
