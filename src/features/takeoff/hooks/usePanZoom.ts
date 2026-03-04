import { useState, useCallback, useRef } from "react";
import type { Point } from "../types/takeoff.types";

export type PanZoomConfig = {
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
  initialZoom?: number;
  initialPanX?: number;
  initialPanY?: number;
};

export function usePanZoom(config: PanZoomConfig = {}) {
  const {
    minZoom = 0.1,
    maxZoom = 10,
    zoomSpeed = 0.1,
    initialZoom = 1,
    initialPanX = 0,
    initialPanY = 0,
  } = config;

  const [zoom, setZoom] = useState(initialZoom);
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);

  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef<Point>({ x: 0, y: 0 });

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * (1 + zoomSpeed), maxZoom));
  }, [zoomSpeed, maxZoom]);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev * (1 - zoomSpeed), minZoom));
  }, [zoomSpeed, minZoom]);

  const zoomToCursor = useCallback(
    (cursorX: number, cursorY: number, delta: number) => {
      setZoom((prevZoom) => {
        const newZoom = Math.max(
          minZoom,
          Math.min(maxZoom, prevZoom * (1 + delta * zoomSpeed))
        );

        if (newZoom === prevZoom) return prevZoom;

        const zoomRatio = newZoom / prevZoom;

        setPanX((prevPanX) => cursorX - (cursorX - prevPanX) * zoomRatio);
        setPanY((prevPanY) => cursorY - (cursorY - prevPanY) * zoomRatio);

        return newZoom;
      });
    },
    [zoomSpeed, minZoom, maxZoom]
  );

  const handleWheel = useCallback(
    (e: WheelEvent, containerRect: DOMRect) => {
      e.preventDefault();

      const cursorX = e.clientX - containerRect.left;
      const cursorY = e.clientY - containerRect.top;

      const delta = -Math.sign(e.deltaY);
      zoomToCursor(cursorX, cursorY, delta);
    },
    [zoomToCursor]
  );

  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanningRef.current = true;
    lastMousePosRef.current = { x: clientX, y: clientY };
  }, []);

  const updatePan = useCallback((clientX: number, clientY: number) => {
    if (!isPanningRef.current) return;

    const dx = clientX - lastMousePosRef.current.x;
    const dy = clientY - lastMousePosRef.current.y;

    setPanX((prev) => prev + dx);
    setPanY((prev) => prev + dy);

    lastMousePosRef.current = { x: clientX, y: clientY };
  }, []);

  const endPan = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const resetView = useCallback(() => {
    setZoom(initialZoom);
    setPanX(initialPanX);
    setPanY(initialPanY);
  }, [initialZoom, initialPanX, initialPanY]);

  const fitToView = useCallback(
    (contentWidth: number, contentHeight: number, containerWidth: number, containerHeight: number) => {
      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const newZoom = Math.min(scaleX, scaleY, maxZoom);

      setZoom(newZoom);
      setPanX((containerWidth - contentWidth * newZoom) / 2);
      setPanY((containerHeight - contentHeight * newZoom) / 2);
    },
    [maxZoom]
  );

  const screenToWorld = useCallback(
    (screenPoint: Point): Point => {
      return {
        x: (screenPoint.x - panX) / zoom,
        y: (screenPoint.y - panY) / zoom,
      };
    },
    [zoom, panX, panY]
  );

  const worldToScreen = useCallback(
    (worldPoint: Point): Point => {
      return {
        x: worldPoint.x * zoom + panX,
        y: worldPoint.y * zoom + panY,
      };
    },
    [zoom, panX, panY]
  );

  return {
    zoom,
    panX,
    panY,
    zoomIn,
    zoomOut,
    zoomToCursor,
    handleWheel,
    startPan,
    updatePan,
    endPan,
    resetView,
    fitToView,
    screenToWorld,
    worldToScreen,
    isPanning: isPanningRef.current,
  };
}
