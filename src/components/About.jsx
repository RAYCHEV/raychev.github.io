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
            I am an IT Support professional with a comprehensive and dynamic skill set that spans 
            across IT support analysis, network security, software development, and native mobile 
            app development. With several years of experience in the IT field, I have developed 
            a unique ability to address complex challenges with strategic and innovative solutions. 
            My expertise includes a strong foundation in iOS native development, cross-platform 
            and web development.
          </p>
        </div>
      </div>
    </section>
  )
}

export default About

