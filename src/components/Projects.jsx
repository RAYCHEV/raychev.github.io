import React from 'react'
import ProjectCard from './ProjectCard'

function Projects() {
  const projects = [
    {
      id: 1,
      label: "[2022] Swift, SwiftUI, CoreData, AWS",
      title: "Self Service Store System",
      logo: "/img/2-0LogoSSSS.png",
      description: (
        <>
          Developed for iPadOS 15.5+<br />
          An innovative kiosk-style self-service asset management tool designed recently for the iPad. 
          This user-friendly app allows customers to conveniently register and manage items directly 
          from a device as they "shop in-store". Simplifying the inventory process, the app is a 
          valuable addition to the inventory ecosystem, promoting self-sufficiency and efficiency 
          for both customers and store administrators.
        </>
      ),
      images: [
        "/img/2-1SelfServiceSimulatorScreenShot-iPad9thgeneration-2022-08-22at14.21.52.png",
        "/img/2-2SelfServiceSimulatorScreenShot-iPad9thgeneration-2022-08-22at14.22.28.png",
        "/img/2-3SelfServiceSimulatorScreenShot-iPad9thgeneration-2022-08-22at14.22.46.png",
        "/img/2-4SelfServiceSimulatorScreenShot-iPad9thgeneration-2022-08-22at14.23.33.png",
        "/img/2-5SelfServiceSimulatorScreenShot-iPad9thgeneration-2022-08-22at14.23.44.png"
      ],
      link: null
    },
    {
      id: 2,
      label: "[2020] Electron, JS, NodeJS, Express",
      title: "HR Free Form",
      description: (
        <>
          HR Free Form is a versatile, cross-platform application designed to streamline HR processes 
          by reducing face-to-face communication. Inspired by the HR team at a company I supported as 
          IT Support, this app was developed using Electron, JavaScript, Node.js, and Express to address 
          the challenges of the Covid-19. It runs seamlessly on both Ubuntu and Windows operating systems.
          <br /><br />
          The app supports distinct roles for Admin (HR) and normal users, ensuring secure and appropriate 
          access to features and data. Optimized for installation on kiosks, HR Free Form allows employees 
          to independently fill out forms at designated kiosks without direct HR interaction. HR 
          administrators can easily set up and customize forms, meeting the specific needs of their 
          organization without requiring technical support.
          <br /><br />
          HR Free Form empowers workers to fill out necessary forms independently, reducing the need for 
          in-person interactions and maintaining safety protocols during the Covid-19. This app enhances 
          both safety and productivity in the workplace, making HR processes more efficient and effective.
          <br /><br />
          This code and application cannot be shared or distributed as it was developed exclusively for 
          my former employer.
        </>
      ),
      images: ["/img/ScreenshotFreeForm.png"],
      link: null
    },
    {
      id: 3,
      label: "[2019] Electron, JS, NodeJS, Express",
      title: "Self Service Store System",
      description: (
        <>
          Self Service Store System is a cross-platform inventory management application built using 
          Electron JS, specifically designed for Ubuntu kiosk machines but fully functional on Windows 
          as well. This versatile tool is tailored for self-service retail environments, allowing 
          businesses to manage their inventory with ease and efficiency.
          <br /><br />
          The application features a clean, user-friendly interface that simplifies tasks such as tracking 
          stock levels, setting low-inventory alerts, and processing transactions. With customization 
          options available, Self Service Store can adapt to the unique needs of various businesses, 
          from small retail kiosks to larger self-service operations.
          <br /><br />
          Whether you're running a single kiosk or managing multiple locations, Self Service Store provides 
          a reliable and straightforward solution for keeping your inventory in check, ensuring that your 
          business operates smoothly and efficiently.
          <br /><br />
          This code and application cannot be shared or distributed as it was developed exclusively for 
          my former employer.
        </>
      ),
      images: ["/img/SelfServiceStore.png"],
      link: null
    },
    {
      id: 4,
      label: "[2018] Swift, UIKit, Firebase API",
      title: "Game Of Verbs",
      description: (
        <>
          Game of Verbs is a dynamic educational app designed to make learning English irregular verbs 
          fun and interactive. It features a rewarding point system and user progress tracking through 
          secure login, enhanced by a Firebase API-powered database for smooth performance and data 
          security. Whether starting out or brushing up, users enjoy a personalized and engaging learning 
          experience.
        </>
      ),
      images: ["/img/Screenshot 2018-12-24 at 16.43.39.png"],
      link: "https://github.com/RAYCHEV/GameOfVerbs"
    },
    {
      id: 5,
      label: "[2017] PHP, HTML, JS",
      title: "Blog system",
      description: (
        <>
          The PHP Blog System is a collaborative creation by a university team, designed to offer a robust 
          and user-friendly platform for content sharing and interaction. Developed with PHP, this system 
          allows for easy posting, editing, and management of blog content, catering to both the tech-savvy 
          and novice users alike. The team's efforts have culminated in a feature-rich platform that supports 
          user registration, comments, and a dynamic content display, all within a secure and intuitive 
          interface. This project not only demonstrates the team's technical skills in web development but 
          also their commitment to enhancing digital communication through effective teamwork.
        </>
      ),
      images: [],
      link: "https://github.com/SoftuniDarby/blog"
    },
    {
      id: 6,
      label: "[2016-17] Python, PHP, HTML",
      title: "Smart Home project on Raspberry Pi",
      description: (
        <>
          The Smart Home project, developed on a Raspberry Pi, represents an innovative solution for 
          automating home devices such as fans and door lights. This compact yet powerful system was brought 
          to life by a dedicated duo, leveraging the versatility of Python, PHP, and HTML to create a 
          seamless user experience. Through intuitive web interfaces and efficient backend scripting, users 
          can effortlessly control their home appliances, ensuring comfort and convenience. The project not 
          only underscores the potential of Raspberry Pi in home automation but also highlights the 
          collaboration and technical prowess of the team, showcasing their ability to integrate diverse 
          technologies into a cohesive smart home ecosystem.
        </>
      ),
      images: [],
      link: "https://github.com/quite-smart-stuff/smart-home"
    },
    {
      id: 7,
      label: "[2014] Java",
      title: "Terminal Ping Pong Game",
      description: (
        <>
          Terminal Ping Pong, crafted by a team from Software University, is a minimalist Java game that 
          rejuvenates classic arcade ping pong into a text-based experience, adaptable to any Java-enabled 
          terminal. This project, part of their Java and team work education, showcases not only coding skills 
          but also collaboration and project management. The game's highlight is its adjustable gaming screen, 
          which allows players to customize the play area size to their liking. Players use paddles to bounce 
          a ball back and forth, with the aim to keep it in play, featuring adjustable speeds, paddle sizes, 
          and a simple score tracker for an engaging experience. Developed with Java, Terminal Ping Pong ensures 
          smooth gameplay and wide compatibility across different operating systems, embodying a perfect blend 
          of education, teamwork, and entertainment accessible directly from your terminal.
        </>
      ),
      images: [],
      link: "https://github.com/RAYCHEV/Java-Basics-Teamwork-Sept-2014/"
    },
    {
      id: 8,
      label: "[2014] PHP, SQL, HTML, CSS, JS",
      title: "Forum system",
      description: (
        <>
          A legacy PHP application for a forum represents a system developed using procedural PHP and SQL 
          without leveraging Object-Oriented Programming principles. This type of application is structured 
          around scripts that directly manipulate data stored in a SQL database and handle the logic for 
          various forum functionalities.
        </>
      ),
      images: [],
      link: "https://github.com/RAYCHEV/Aug2014FinalProject-Forum/"
    }
  ]

  return (
    <section id="projects" className="container mt-5">
      <h1>Projects</h1>
      <div className="row">
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  )
}

export default Projects


