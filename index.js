import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { roundTo } from 'round-to';

dotenv.config();

const tempoEspera = process.env.TEMPO_ESPERA || 30000;
const horaFechamento = process.env.HORA_FECHAMENTO;

const quantidade = process.env.QUANTIDADE || 1;
const valorCompraVenda = process.env.VALOR_COMPRA || 0;
const variacaoPercentualExperada = process.env.VARIACAO_PERCENTUAL_EXPERADA;

async function getBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--headless'],
  });

  return browser;
}

function sendMail(variacaoPercentual, valorAtual, quantidade) {
  try {
    let transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    transporter.sendMail({
      from: `"${process.env.EMAIL_USERNAME}" <${process.env.EMAIL_MAIL_FROM}>`,
      to: process.env.EMAIL_MAIL_TO,
      subject: `Variação do preço: ${variacaoPercentual.toFixed(2)}%`,
      html: `
        <b>Valor atual: R$ ${valorAtual}</b></br>
        <b>Variação: ${variacaoPercentual.toFixed(2)}%</b></br>
        <b>Saldo: R$ ${(quantidade * valorAtual).toFixed(2)}</b>
      `,
    });
  } catch (error) {
    console.log(error);
  }
}

function getVariacaoPercentual(precoAtual, precoAnterior) {
  return (precoAtual / precoAnterior - 1) * 100;
}

async function getPrecoAtual(browser) {
  const page = await browser.newPage();

  const url = process.env.URL;
  const selector = process.env.QUERY_SELECTOR;

  try {
    await page.goto(url);

    const precoAtual = await page.evaluate((selector) => {
      const preco = document.querySelector(selector).innerText;
      return parseFloat(preco.replace(',', '.'));
    }, selector);

    page.close();

    return precoAtual;
  } catch (error) {
    console.log(error);

    page.close();

    return valorCompraVenda;
  }
}

function printLog(valorAtual, variacaoPercentual) {
  console.info(`${new Date().toLocaleString()}`, {
    valor: valorAtual,
    variacao: roundTo(variacaoPercentual, 2),
    saldo: roundTo(quantidade * valorAtual, 2),
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start() {
  const browser = await getBrowser();

  while (new Date().getHours() < horaFechamento) {
    const valorAtual = await getPrecoAtual(browser);
    const variacaoPercentual = getVariacaoPercentual(
      valorAtual,
      valorCompraVenda
    );

    printLog(valorAtual, variacaoPercentual);

    if (
      !Number.isNaN(variacaoPercentual) &&
      Number.isFinite(variacaoPercentual)
    ) {
      if (variacaoPercentual >= variacaoPercentualExperada) {
        sendMail(variacaoPercentual, valorAtual, quantidade);
      }
    }

    await delay(tempoEspera);
  }

  browser.close();
}

start();
