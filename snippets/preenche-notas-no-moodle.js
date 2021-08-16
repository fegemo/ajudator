(function () {

  // COLAR AQUI O notas.json gerado pelo Ajudator
  const tarefa = {
    "tarefa": "ovelhas",
    "submissoes": [
      {
        "nome": "Alex Fabiany Fernandes Filho",
        "nota": 1
      },
      {
        "nome": "Aline Vitória Silva Nunes",
        "nota": 0
      },
      {
        "nome": "Ana Clara Almeida Agostinho",
        "nota": 0
      },
      {
        "nome": "Ana Flavia Arruda De Sousa Oliveira",
        "nota": 0
      },
      {
        "nome": "Ana Luisa De Souza Santos",
        "nota": 0
      },
      {
        "nome": "Ana Paula Nascimento Ricardo",
        "nota": 0
      },
      {
        "nome": "André Henriques Parreiras",
        "nota": 1.1
      },
      {
        "nome": "Arthur Araujo Ribeiro",
        "nota": 0.9
      },
      {
        "nome": "Arthur Santana de Souza Almeida",
        "nota": 1.2
      },
      {
        "nome": "Bernardo Soares Faria",
        "nota": 1.1
      },
      {
        "nome": "Davi Assunção dos Santos",
        "nota": 0.95
      },
      {
        "nome": "Davi Martins Lage",
        "nota": 1.1
      },
      {
        "nome": "Enzo Bambirra Pinto",
        "nota": 1.2
      },
      {
        "nome": "Fabiana Kelly Alves Ribeiro",
        "nota": 0.95
      },
      {
        "nome": "Geovana Cristina Vicente Soares",
        "nota": 0
      },
      {
        "nome": "Gustavo Henrique Fernandes Santana",
        "nota": 1.1
      },
      {
        "nome": "Gustavo Marcelo Penido Pereira",
        "nota": 1.1
      },
      {
        "nome": "Iasmin de Almeida Furtado",
        "nota": 1
      },
      {
        "nome": "Isabella do Carmo Gomes Pereira",
        "nota": 1
      },
      {
        "nome": "Israel Davi de Assis Resende",
        "nota": 0
      },
      {
        "nome": "João Pedro Torres",
        "nota": 1.1
      },
      {
        "nome": "Julia Lendell Batista",
        "nota": 1.2
      },
      {
        "nome": "Kauã dos Santos Rodrigues",
        "nota": 1
      },
      {
        "nome": "Letícia Leonardo Pereira",
        "nota": 1.2
      },
      {
        "nome": "Luan Pablo Soares Xavier",
        "nota": 0
      },
      {
        "nome": "Lucas Alexandre de Carvalho Silva",
        "nota": 1.1
      },
      {
        "nome": "Marcos Antonio Reis Silva",
        "nota": 0.5
      },
      {
        "nome": "Maria Eduarda Nunes Silva",
        "nota": 1
      },
      {
        "nome": "Maria Eduarda Rezende Pereira",
        "nota": 1
      },
      {
        "nome": "Mateus Henrique Medeiros Diniz",
        "nota": 1
      },
      {
        "nome": "Penelope Luiza Gonçalves Barbosa",
        "nota": 1.1
      },
      {
        "nome": "Priscilla Kellen Ferreira Diniz",
        "nota": 0.9
      },
      {
        "nome": "Raissa Fagundes da Silva",
        "nota": 0
      },
      {
        "nome": "Rayanne Mirelle de Souza Santos",
        "nota": 0
      },
      {
        "nome": "Ronan Aparecido Vinhal Neto",
        "nota": 0
      },
      {
        "nome": "Samuel Pereira de Almeida",
        "nota": 0
      },
      {
        "nome": "Seynabou Sall Coulibaly",
        "nota": 0
      },
      {
        "nome": "Sofia Pereira Luiz",
        "nota": 1.2
      },
      {
        "nome": "Stella Maris Moreira Madureira",
        "nota": 1.2
      }
    ]
  }


  const tableSelector = '.quickgradingform table:not(.ygtvtable)'
  const rowSelector = ':scope > tbody > tr:not(.emptyrow)'
  const nameSelector = ':scope > td.cell.c2 a'
  const gradeInputSelector = ':scope > td.cell.c5 input.quickgrade'
  const commentSelector = ':scope > td.cell.c12 textarea.quickgrade, :scope > td.cell.c11 textarea.quickgrade'

  const maxGrade = prompt(`Digite o valor da atividade "${tarefa.tarefa}":`, 2) || 2
  const capGradeAtMax = true
  const numberFormatter = new Intl.NumberFormat('pt-BR')
  const tableEl = document.querySelector(tableSelector)
  const rows = Array.from(tableEl?.querySelectorAll(rowSelector))
  const namesAndRows = rows
    ?.map(rowEl => ({
      name: rowEl.querySelector(nameSelector).innerHTML,
      gradingEl: rowEl.querySelector(gradeInputSelector),
      commentEl: rowEl.querySelector(commentSelector),
      rowEl
    }))


  tarefa.submissoes
    .forEach(submissao => {
      const studentRow = namesAndRows.find(findByNameGenerator(submissao.nome))
      if (studentRow) {
        let comment = generateInitialComment(submissao)
        let grade = (submissao.nota * maxGrade)
        if (capGradeAtMax) {
          if (submissao.nota > 1) {
            comment += `+${numberFormatter.format(grade - maxGrade)} extras\n`
          }
          grade = Math.min(grade, maxGrade)
        }
        studentRow.gradingEl.value = numberFormatter.format(grade.toFixed(2))
        studentRow.commentEl.value = comment
      } else {
        console.warn(`Aluno ${submissao.nome} não encontrado na página do Moodle.`)
      }
    })



  function findByNameGenerator(ajudatorName) {
    const nameCleanupRegex = /[']/ig
    return (nameAndRow) => {
      const cleanedName = nameAndRow.name.replaceAll(nameCleanupRegex, '')
      return cleanedName.toLowerCase() === ajudatorName.toLowerCase()
    }
  }

  function generateInitialComment(submissao) {
    switch (true) {
      case submissao.nota >= 1:
        return `Muito bem, ${getFirstName(submissao)}! Brilhou =)\n`
      case submissao.nota >= 0.8:
        return `Muito bem, ${getFirstName(submissao)}!\nVeja os comentários no arquivo.`
      case submissao.nota < 0.00001:
        return `Trabalho não foi entregue.`
      default:
        return `${getFirstName(submissao)}, veja os comentários no arquivo.`
    }
  }

  function getFirstName(submissao) {
    return submissao.nome.split(' ')[0]
  }
}())