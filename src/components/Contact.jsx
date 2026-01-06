import React, { useState } from 'react'

function Contact() {
  const [formData, setFormData] = useState({
    email: '',
    message: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Form submission is handled by Formspree
    const form = e.target
    form.submit()
  }

  return (
    <section id="contact" className="container mt-5">
      <h1>Contact</h1>
      <form 
        action="https://formspree.io/f/mjvnaryp" 
        method="POST" 
        className="needs-validation" 
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="form-group">
          <label htmlFor="email">Email address</label>
          <input 
            type="email" 
            className="form-control" 
            id="email" 
            name="email" 
            aria-describedby="emailHelp" 
            required
            value={formData.email}
            onChange={handleChange}
          />
          <div className="invalid-feedback">
            Please enter a valid email address.
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="message">Message</label>
          <textarea 
            className="form-control" 
            id="message" 
            name="message" 
            rows="3" 
            required
            value={formData.message}
            onChange={handleChange}
          ></textarea>
          <div className="invalid-feedback">
            Please enter your message.
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Send</button>
      </form>
    </section>
  )
}

export default Contact

