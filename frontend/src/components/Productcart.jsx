"use client"

import { Heart, Eye } from 'lucide-react'
import { useState } from "react"

export default function ProductCard() {
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const toggleWishlist = () => {
    setIsWishlisted(!isWishlisted)
  }

  return (
    <div className="w-full max-w-sm mx-auto p-4">
      <div 
        className="relative bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-105"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Product Image Container */}
        <div className="relative bg-gray-50 p-6 group">
          {/* Discount Badge */}
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded animate-pulse">
              -40%
            </span>
          </div>

          {/* Action Icons */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <button
              onClick={toggleWishlist}
              className={`p-2 rounded-full transition-all duration-300 ${
                isWishlisted 
                  ? 'bg-red-500 text-white' 
                  : 'bg-white text-gray-600 hover:bg-red-50 hover:text-red-500'
              } shadow-md hover:shadow-lg hover:scale-110`}
              aria-label="Add to wishlist"
            >
              <Heart 
                size={16} 
                className={`transition-all duration-300 ${
                  isWishlisted ? 'fill-current' : ''
                }`} 
              />
            </button>
            <button
              className="p-2 bg-white text-gray-600 rounded-full shadow-md hover:shadow-lg hover:scale-110 hover:bg-gray-50 transition-all duration-300"
              aria-label="Quick view"
            >
              <Eye size={16} />
            </button>
          </div>

          {/* Product Image */}
          <div className="flex items-center justify-center h-48 sm:h-56">
            <img
              src="/images/gamepad.png"
              alt="HAVIT HV-G92 Gamepad"
              className={`max-w-full max-h-full object-contain transition-all duration-500 ${
                isHovered ? 'scale-110 rotate-2' : 'scale-100'
              }`}
            />
          </div>

          {/* Hover Overlay */}
          <div className={`absolute inset-0 bg-black transition-opacity duration-300 ${
            isHovered ? 'opacity-5' : 'opacity-0'
          }`} />
        </div>

        {/* Product Info */}
        <div className="p-4 space-y-3">
          {/* Product Name */}
          <h3 className="text-base sm:text-lg font-medium text-gray-900 leading-tight hover:text-red-500 transition-colors duration-300 cursor-pointer">
            HAVIT HV-G92 Gamepad
          </h3>

          {/* Pricing */}
          <div className="flex items-center gap-3">
            <span className="text-lg sm:text-xl font-bold text-red-500">
              $120
            </span>
            <span className="text-sm sm:text-base text-gray-500 line-through">
              $160
            </span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <svg
                  key={i}
                  className="w-4 h-4 text-yellow-400 fill-current"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-sm text-gray-500">(88)</span>
          </div>
        </div>

        {/* Add to Cart Button (appears on hover) */}
        <div className={`absolute bottom-4 left-4 right-4 transition-all duration-300 ${
          isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <button className="w-full bg-red-500 text-white py-2 px-4 rounded-md font-medium hover:bg-red-600 transition-colors duration-200 transform hover:scale-105">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
