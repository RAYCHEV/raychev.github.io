import React, { useState } from 'react'

function CSVViewer() {
  const [csvData, setCsvData] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [fileInput, setFileInput] = useState(null)

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        parseCSV(text)
        setError('')
      } catch (err) {
        setError('Error reading file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim() !== '')
    
    if (lines.length === 0) {
      setError('CSV file is empty')
      return
    }

    // Parse headers
    const headerLine = lines[0]
    const parsedHeaders = parseCSVLine(headerLine)
    setHeaders(parsedHeaders)

    // Parse rows
    const parsedRows = lines.slice(1).map(line => parseCSVLine(line))
    setRows(parsedRows)
    setCsvData({ headers: parsedHeaders, rows: parsedRows })
  }

  const parseCSVLine = (line) => {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const handleClear = () => {
    setCsvData(null)
    setHeaders([])
    setRows([])
    setError('')
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const exportToCSV = () => {
    if (!csvData) return

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'exported.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <section id="csvviewer" className="container mt-5">
      <h1>CSV Viewer</h1>
      
      <div className="mb-4">
        <div className="form-group">
          <label htmlFor="csvFile">Upload CSV File</label>
          <input
            type="file"
            className="form-control-file"
            id="csvFile"
            accept=".csv"
            onChange={handleFileUpload}
            ref={(input) => setFileInput(input)}
          />
          <small className="form-text text-muted">
            Select a CSV file to view its contents in a table format
          </small>
        </div>

        {csvData && (
          <div className="mt-3">
            <button 
              className="btn btn-secondary mr-2" 
              onClick={handleClear}
            >
              Clear
            </button>
            <button 
              className="btn btn-primary" 
              onClick={exportToCSV}
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {csvData && (
        <div className="table-responsive">
          <table className="table table-striped table-bordered table-hover">
            <thead className="thead-dark">
              <tr>
                {headers.map((header, index) => (
                  <th key={index} scope="col">
                    {header || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      {cell || '-'}
                    </td>
                  ))}
                  {/* Fill empty cells if row has fewer columns than headers */}
                  {row.length < headers.length && 
                    Array.from({ length: headers.length - row.length }).map((_, index) => (
                      <td key={`empty-${index}`}>-</td>
                    ))
                  }
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted mt-2">
            Showing {rows.length} row{rows.length !== 1 ? 's' : ''} with {headers.length} column{headers.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {!csvData && !error && (
        <div className="alert alert-info" role="alert">
          Please upload a CSV file to get started. The CSV viewer will display your data in a formatted table.
        </div>
      )}
    </section>
  )
}

export default CSVViewer

