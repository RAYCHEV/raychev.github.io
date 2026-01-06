import React from 'react'

function About() {
  return (
    <section id="about" className="container mt-5">
      <div className="row">
        {/* Picture Column */}
        <div className="col-md-4">
          <img 
            src="/img/8bitFinalFantasyScene.png" 
            alt="About Me" 
            className="img-fluid about-me-image"
          />
        </div>
        {/* Text Column */}
        <div className="col-md-8">
          <h1>About Me</h1>
          <p>
            Software engineer focused on building modern web and mobile apps. I combine strong 
            analysis with hands-on development to turn real requirements into clean, maintainable 
            software—mainly with JavaScript/React for the web and native + React Native for mobile.
          </p>
        </div>
      </div>
    </section>
  )
}

export default About


