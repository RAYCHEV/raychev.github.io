import React, { useState } from 'react'

function ProjectCard({ project }) {
  const [expandedImages, setExpandedImages] = useState({})

  const handleImageClick = (imageIndex) => {
    setExpandedImages(prev => ({
      ...prev,
      [imageIndex]: !prev[imageIndex]
    }))
  }

  return (
    <div className="col-md-4 mb-4">
      <div className="card">
        {project.label && <label className="card-label">{project.label}</label>}
        <div className="card-body">
          {project.logo && (
            <img 
              src={project.logo} 
              className="card-img-top" 
              alt={`${project.title} Logo`}
            />
          )}
          <h5 className="card-title">{project.title}</h5>
          <p className="card-text">{project.description}</p>
          
          {project.link && (
            <a href={project.link} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
              Go to the code
            </a>
          )}

          {project.images && project.images.length > 0 && (
            <div className="project-images-container">
              {project.images.map((image, index) => (
                <img
                  key={index}
                  src={image}
                  alt={`${project.title} screenshot ${index + 1}`}
                  className={`project-image ${expandedImages[index] ? 'expanded-image' : 'small-image'}`}
                  onClick={() => handleImageClick(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectCard


