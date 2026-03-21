import React, { useEffect, useRef, useState } from "react";
import { theme } from "../../lib/theme";

interface VirtualTableProps<T> {
  data: T[];
  rowHeight?: number;
  headerHeight?: number;
  overscan?: number;
  className?: string;
  renderHeader: () => React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
}

export function VirtualTable<T>({
  data,
  rowHeight = 60,
  headerHeight = 48,
  overscan = 5,
  className = "",
  renderHeader,
  renderRow,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    container.addEventListener("scroll", handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const totalHeight = data.length * rowHeight;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleEnd = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  const visibleData = data.slice(visibleStart, visibleEnd);
  const offsetY = visibleStart * rowHeight;

  return (
    <div ref={containerRef} className={`overflow-auto ${className}`}>
      <div style={{ height: headerHeight }} className={`sticky top-0 z-10 ${theme.table.header}`}>
        {renderHeader()}
      </div>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleData.map((item, index) => renderRow(item, visibleStart + index))}
        </div>
      </div>
    </div>
  );
}
