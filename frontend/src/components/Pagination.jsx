import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }) {
  if (totalPages <= 1 && totalItems > 0) {
    return (
      <div className="pagination">
        <div className="pagination-info">
          Showing all {totalItems} entries
        </div>
      </div>
    )
  }
  if (totalItems === 0) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i)
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      pages.push('...')
    }
  }
  
  const uniquePages = pages.filter((p, idx, arr) => p !== '...' || arr[idx - 1] !== '...')

  return (
    <div className="pagination">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalItems} entries
      </div>
      <div className="pagination-controls">
        <button 
          className="page-btn" 
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        {uniquePages.map((p, i) => (
          <button 
            key={i} 
            className={`page-btn ${p === currentPage ? 'active' : ''}`}
            disabled={p === '...'}
            onClick={() => p !== '...' && onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button 
          className="page-btn" 
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
