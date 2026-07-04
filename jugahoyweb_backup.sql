-- MySQL dump 10.13  Distrib 9.7.0, for Win64 (x86_64)
--
-- Host: localhost    Database: jugahoyweb
-- ------------------------------------------------------
-- Server version	9.7.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agenda`
--

DROP TABLE IF EXISTS `agenda`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agenda` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `estado` enum('disponible','reservado','confirmado','cancelado','bloqueado') DEFAULT 'disponible',
  `precio` decimal(10,2) DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','mercadopago','tarjeta') DEFAULT NULL,
  `notas` text,
  `origen` enum('web','manual','telefono') DEFAULT 'web',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `field_id` (`field_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `agenda_ibfk_17` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `agenda_ibfk_18` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agenda`
--

LOCK TABLES `agenda` WRITE;
/*!40000 ALTER TABLE `agenda` DISABLE KEYS */;
/*!40000 ALTER TABLE `agenda` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field_id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicio` varchar(5) NOT NULL,
  `hora_fin` varchar(5) NOT NULL,
  `duracion` int NOT NULL,
  `nombre_cliente` varchar(150) NOT NULL,
  `telefono_cliente` varchar(30) DEFAULT NULL,
  `email_cliente` varchar(150) DEFAULT NULL,
  `metodo_pago` enum('efectivo','transferencia','mercadopago','tarjeta') DEFAULT 'efectivo',
  `monto` decimal(10,2) DEFAULT NULL,
  `estado` enum('pendiente','confirmado','cancelado','rechazado') DEFAULT 'confirmado',
  `notas` text,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `field_id` (`field_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` VALUES (1,1,'2026-05-08','14:00','15:00',60,'Mauro','38154121','Largomauroandres@hotmail.com','efectivo',25000.00,'confirmado','',1,'2026-05-08 16:52:54','2026-05-08 16:52:54',NULL),(2,1,'2026-05-08','15:00','16:30',90,'Mauro','454665564','Largomauroandres@hotmail.com','efectivo',25000.00,'cancelado','',1,'2026-05-08 16:53:34','2026-05-08 16:58:41',NULL),(3,2,'2026-05-08','16:30','17:30',60,'susana sueldo','38154121212','','efectivo',25000.00,'confirmado','',4,'2026-05-08 18:00:57','2026-05-08 18:00:57',NULL),(4,2,'2026-05-08','19:30','21:30',120,'susana sueldo','38154121212','','efectivo',50000.00,'confirmado','',4,'2026-05-08 21:14:25','2026-05-08 21:14:25',NULL),(5,1,'2026-05-08','20:30','21:30',60,'juan garcia','38144556688','','efectivo',25000.00,'confirmado','',1,'2026-05-08 21:29:32','2026-05-08 21:29:32',NULL),(6,1,'2026-05-28','19:00','20:00',60,'juan garcia','3815900096','','efectivo',25000.00,'cancelado','',7,'2026-05-28 14:16:53','2026-05-28 14:36:51',NULL),(7,2,'2026-05-28','19:00','20:00',60,'juan garcia','3815900096','','efectivo',25000.00,'cancelado','',7,'2026-05-28 14:19:53','2026-05-28 14:37:00',NULL),(8,1,'2026-05-28','12:30','13:30',60,'juan garcia','3815900096','','efectivo',25000.00,'cancelado','',7,'2026-05-28 14:33:17','2026-05-28 14:36:44',NULL),(11,2,'2026-05-28','18:00','19:00',60,'juan garcia','3815900096','','efectivo',25000.00,'confirmado','',7,'2026-05-28 14:50:14','2026-05-28 14:50:59',7),(12,1,'2026-05-28','20:00','21:00',60,'juan garcia','3815900096','','efectivo',25000.00,'rechazado','',7,'2026-05-28 15:47:20','2026-05-28 15:48:40',7);
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cash_registers`
--

DROP TABLE IF EXISTS `cash_registers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cash_registers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complex_id` int NOT NULL,
  `fecha_apertura` datetime DEFAULT NULL,
  `fecha_cierre` datetime DEFAULT NULL,
  `monto_inicial` decimal(10,2) DEFAULT '0.00',
  `monto_final` decimal(10,2) DEFAULT NULL,
  `estado` enum('abierta','cerrada') DEFAULT 'abierta',
  `usuario_apertura_id` int DEFAULT NULL,
  `usuario_cierre_id` int DEFAULT NULL,
  `notas` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `complex_id` (`complex_id`),
  CONSTRAINT `cash_registers_ibfk_1` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cash_registers`
--

LOCK TABLES `cash_registers` WRITE;
/*!40000 ALTER TABLE `cash_registers` DISABLE KEYS */;
INSERT INTO `cash_registers` VALUES (1,1,'2026-04-29 14:31:28',NULL,0.00,NULL,'abierta',1,NULL,NULL,'2026-04-29 14:31:28','2026-04-29 14:31:28');
/*!40000 ALTER TABLE `cash_registers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cash_transactions`
--

DROP TABLE IF EXISTS `cash_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cash_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cash_register_id` int NOT NULL,
  `tipo` enum('ingreso','egreso') NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','transferencia','mercadopago','tarjeta') DEFAULT 'efectivo',
  `categoria` varchar(100) DEFAULT NULL,
  `agenda_id` int DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `fecha` datetime DEFAULT NULL,
  `notas` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `cash_register_id` (`cash_register_id`),
  CONSTRAINT `cash_transactions_ibfk_1` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cash_transactions`
--

LOCK TABLES `cash_transactions` WRITE;
/*!40000 ALTER TABLE `cash_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `cash_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `collaborators`
--

DROP TABLE IF EXISTS `collaborators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collaborators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complex_id` int NOT NULL,
  `user_id` int NOT NULL,
  `nombre` varchar(100) DEFAULT NULL,
  `apellido` varchar(100) DEFAULT NULL,
  `permisos` json DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `complex_id` (`complex_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `collaborators_ibfk_17` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `collaborators_ibfk_18` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `collaborators`
--

LOCK TABLES `collaborators` WRITE;
/*!40000 ALTER TABLE `collaborators` DISABLE KEYS */;
INSERT INTO `collaborators` VALUES (1,1,3,'David','Pedrini','{\"caja\": true, \"agenda\": true, \"operaciones\": true, \"estadisticas\": false, \"colaboradores\": false, \"configuracion\": false}',0,'2026-04-29 14:41:38','2026-05-08 22:02:50'),(2,1,5,'Facundo','Largo','{\"caja\": true, \"agenda\": true, \"operaciones\": true, \"estadisticas\": false, \"colaboradores\": false, \"configuracion\": false}',1,'2026-05-08 22:03:21','2026-05-08 22:03:21');
/*!40000 ALTER TABLE `collaborators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complexes`
--

DROP TABLE IF EXISTS `complexes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complexes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `descripcion` text,
  `direccion` varchar(255) NOT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `provincia` varchar(100) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `prestaciones` json DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `banner_url` varchar(255) DEFAULT NULL,
  `owner_id` int NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `mercadopago_token` varchar(255) DEFAULT NULL,
  `cuentas_bancarias` json DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `complexes_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complexes`
--

LOCK TABLES `complexes` WRITE;
/*!40000 ALTER TABLE `complexes` DISABLE KEYS */;
INSERT INTO `complexes` VALUES (1,'Pinta Futbol','','Ruta 38 frente Avenida Mitre','Aguilares','Tucuman','03815900938','Largomauroandres@hotmail.com','[\"Estacionamiento\", \"Vestuarios\", \"Iluminación nocturna\", \"Bar/Cantina\", \"WiFi\"]',NULL,NULL,1,1,NULL,NULL,'2026-04-29 14:30:29','2026-04-29 14:30:29'),(2,'madpadel','complejo de padel','9 de julio 2044','yerba buena','Tucuman','3814512451','madpadel@prueba.com','[\"Estacionamiento\", \"Vestuarios\", \"Iluminación nocturna\", \"Bar/Cantina\", \"WiFi\", \"Seguridad\", \"Tribuna\"]',NULL,NULL,1,1,NULL,NULL,'2026-04-29 14:40:21','2026-04-29 14:40:21'),(3,'La cancha nueva','','concepcion 321','la banda del rio sali','tucuman','35789452','lacancha@prueba.com','[\"Estacionamiento\", \"Iluminación nocturna\", \"Bar/Cantina\", \"WiFi\"]',NULL,NULL,4,1,NULL,NULL,'2026-05-28 13:52:09','2026-05-28 13:52:09'),(4,'las canas ','','camino del peru','alderetes','tucuman','12345645','lascanas@prueba.com','[\"Iluminación nocturna\", \"Estacionamiento\", \"Bar/Cantina\", \"WiFi\"]',NULL,NULL,6,1,NULL,NULL,'2026-05-28 14:01:56','2026-05-28 14:01:56');
/*!40000 ALTER TABLE `complexes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contacts`
--

DROP TABLE IF EXISTS `contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `telefono` varchar(25) DEFAULT NULL,
  `asunto` varchar(200) DEFAULT NULL,
  `mensaje` text NOT NULL,
  `ip_origen` varchar(45) DEFAULT NULL,
  `leido` tinyint(1) DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacts`
--

LOCK TABLES `contacts` WRITE;
/*!40000 ALTER TABLE `contacts` DISABLE KEYS */;
/*!40000 ALTER TABLE `contacts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fields`
--

DROP TABLE IF EXISTS `fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fields` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complex_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `deporte` enum('futbol','padel','tenis','basquet','voley','otro') NOT NULL,
  `piso` enum('cesped_sintetico','cemento','parquet','tierra','otro') DEFAULT NULL,
  `dimensiones` varchar(50) DEFAULT NULL,
  `duracion_turno` int DEFAULT '60' COMMENT 'minutos - duración mínima por defecto',
  `techada` tinyint(1) DEFAULT '0',
  `precio_base` decimal(10,2) DEFAULT '0.00',
  `activa` tinyint(1) DEFAULT '1',
  `imagen_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `duraciones_permitidas` json DEFAULT NULL,
  `precios_por_duracion` json DEFAULT NULL,
  `hora_apertura` varchar(5) DEFAULT '08:00',
  `hora_cierre` varchar(5) DEFAULT '02:00',
  PRIMARY KEY (`id`),
  KEY `complex_id` (`complex_id`),
  CONSTRAINT `fields_ibfk_1` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fields`
--

LOCK TABLES `fields` WRITE;
/*!40000 ALTER TABLE `fields` DISABLE KEYS */;
INSERT INTO `fields` VALUES (1,1,'Cancha 1','futbol',NULL,'13*28',60,0,25000.00,1,NULL,'2026-05-08 12:54:08','2026-05-08 21:38:59','[60, 120]',NULL,'08:00','02:00'),(2,1,'Cancha 2','futbol',NULL,'13*28',60,0,25000.00,1,NULL,'2026-05-08 17:19:54','2026-05-08 17:19:54','[60, 120]',NULL,'08:00','02:00'),(3,4,'cancha 1','futbol','cesped_sintetico','15*30',60,0,30000.00,1,NULL,'2026-05-28 14:01:56','2026-05-28 14:01:56','[60]','{}','08:00','02:00');
/*!40000 ALTER TABLE `fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `images`
--

DROP TABLE IF EXISTS `images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL,
  `tipo` enum('hero_slider','hero_banner','complejo','cancha','general') DEFAULT 'general',
  `alt_text` varchar(255) DEFAULT NULL,
  `orden` int DEFAULT '0',
  `activa` tinyint(1) DEFAULT '1',
  `editable_por_general_admin` tinyint(1) DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `images`
--

LOCK TABLES `images` WRITE;
/*!40000 ALTER TABLE `images` DISABLE KEYS */;
/*!40000 ALTER TABLE `images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tipo` enum('nueva_reserva','reserva_confirmada','reserva_rechazada') NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `mensaje` text,
  `leida` tinyint(1) DEFAULT '0',
  `booking_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,1,'nueva_reserva','🔔 Nueva solicitud de turno','juan garcia solicita un turno para el 2026-05-28 de 19:00 a 20:00 (60 min). Entrá a la Agenda para confirmar o rechazar.',0,6,'2026-05-28 14:16:53','2026-05-28 14:16:53'),(2,1,'nueva_reserva','🔔 Nueva solicitud de turno','juan garcia solicita un turno para el 2026-05-28 de 19:00 a 20:00 (60 min). Entrá a la Agenda para confirmar o rechazar.',0,7,'2026-05-28 14:19:53','2026-05-28 14:19:53'),(3,1,'nueva_reserva','🔔 Nueva solicitud de turno','juan garcia solicita un turno para el 2026-05-28 de 12:30 a 13:30 (60 min). Entrá a la Agenda para confirmar o rechazar.',0,8,'2026-05-28 14:33:17','2026-05-28 14:33:17'),(8,1,'nueva_reserva','🔔 Nueva solicitud de turno','juan garcia solicita un turno para el 2026-05-28 de 18:00 a 19:00 (60 min). Entrá a la Agenda para confirmar o rechazar.',0,11,'2026-05-28 14:50:14','2026-05-28 14:50:14'),(9,7,'reserva_confirmada','¡Turno confirmado! ✅','Tu reserva del 2026-05-28 de 18:00 a 19:00 en Cancha 2 fue confirmada. ¡Te esperamos!',1,11,'2026-05-28 14:50:59','2026-05-28 15:49:55'),(10,1,'nueva_reserva','🔔 Nueva solicitud de turno','juan garcia solicita un turno para el 2026-05-28 de 20:00 a 21:00 (60 min). Entrá a la Agenda para confirmar o rechazar.',0,12,'2026-05-28 15:47:20','2026-05-28 15:47:20'),(11,7,'reserva_rechazada','Turno no disponible ❌','Tu reserva del 2026-05-28 a las 20:00 en Cancha 1 no pudo confirmarse. Podés elegir otro horario.',1,12,'2026-05-28 15:48:40','2026-05-28 15:49:55');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `operations`
--

DROP TABLE IF EXISTS `operations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complex_id` int NOT NULL,
  `tipo` enum('reserva','cancelacion','confirmacion','pago','ajuste') NOT NULL,
  `descripcion` text,
  `agenda_id` int DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `monto` decimal(10,2) DEFAULT NULL,
  `fecha` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `complex_id` (`complex_id`),
  CONSTRAINT `operations_ibfk_1` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `operations`
--

LOCK TABLES `operations` WRITE;
/*!40000 ALTER TABLE `operations` DISABLE KEYS */;
INSERT INTO `operations` VALUES (1,1,'reserva','Reserva: leandro — 2026-05-08 14:00',NULL,1,25000.00,'2026-05-08 16:32:39','2026-05-08 16:32:39','2026-05-08 16:32:39'),(2,1,'reserva','Reserva: Mauro — 2026-05-08 14:00-15:00 (60 min)',NULL,1,25000.00,'2026-05-08 16:52:54','2026-05-08 16:52:54','2026-05-08 16:52:54'),(3,1,'reserva','Reserva: Mauro — 2026-05-08 15:00-16:30 (90 min)',NULL,1,25000.00,'2026-05-08 16:53:34','2026-05-08 16:53:34','2026-05-08 16:53:34'),(4,1,'cancelacion','Cancelación: Mauro — 2026-05-08 15:00-16:30',NULL,1,NULL,'2026-05-08 16:58:41','2026-05-08 16:58:41','2026-05-08 16:58:41'),(5,1,'reserva','Reserva web: susana sueldo — 2026-05-08 16:30→17:30 (60min)',NULL,4,25000.00,'2026-05-08 18:00:57','2026-05-08 18:00:57','2026-05-08 18:00:57'),(6,1,'reserva','Reserva web: susana sueldo — 2026-05-08 19:30→21:30 (120min)',NULL,4,50000.00,'2026-05-08 21:14:25','2026-05-08 21:14:25','2026-05-08 21:14:25'),(7,1,'reserva','Reserva: juan garcia — 2026-05-08 20:30-21:30 (60 min)',NULL,1,25000.00,'2026-05-08 21:29:32','2026-05-08 21:29:32','2026-05-08 21:29:32'),(8,1,'reserva','Solicitud web (pendiente): juan garcia — 2026-05-28 19:00→20:00 (60min)',NULL,7,25000.00,'2026-05-28 14:16:53','2026-05-28 14:16:53','2026-05-28 14:16:53'),(9,1,'confirmacion','Reserva confirmada: juan garcia — 2026-05-28 19:00-20:00',NULL,2,NULL,'2026-05-28 14:17:31','2026-05-28 14:17:31','2026-05-28 14:17:31'),(10,1,'reserva','Solicitud web (pendiente): juan garcia — 2026-05-28 19:00→20:00 (60min)',NULL,7,25000.00,'2026-05-28 14:19:53','2026-05-28 14:19:53','2026-05-28 14:19:53'),(11,1,'confirmacion','Reserva confirmada: juan garcia — 2026-05-28 19:00-20:00',NULL,2,NULL,'2026-05-28 14:21:00','2026-05-28 14:21:00','2026-05-28 14:21:00'),(12,1,'reserva','Solicitud web (pendiente): juan garcia — 2026-05-28 12:30→13:30 (60min)',NULL,7,25000.00,'2026-05-28 14:33:17','2026-05-28 14:33:17','2026-05-28 14:33:17'),(13,1,'confirmacion','Reserva confirmada: juan garcia — 2026-05-28 12:30-13:30',NULL,2,NULL,'2026-05-28 14:33:51','2026-05-28 14:33:51','2026-05-28 14:33:51'),(14,1,'cancelacion','Cancelación admin: juan garcia — 2026-05-28 12:30-13:30',NULL,2,NULL,'2026-05-28 14:36:44','2026-05-28 14:36:44','2026-05-28 14:36:44'),(15,1,'cancelacion','Cancelación admin: juan garcia — 2026-05-28 19:00-20:00',NULL,2,NULL,'2026-05-28 14:36:51','2026-05-28 14:36:51','2026-05-28 14:36:51'),(16,1,'cancelacion','Cancelación admin: juan garcia — 2026-05-28 19:00-20:00',NULL,2,NULL,'2026-05-28 14:37:00','2026-05-28 14:37:00','2026-05-28 14:37:00'),(17,1,'reserva','Solicitud web (pendiente): juan garcia — 2026-05-28 18:00→19:00 (60min)',NULL,7,25000.00,'2026-05-28 14:50:14','2026-05-28 14:50:14','2026-05-28 14:50:14'),(18,1,'confirmacion','Reserva confirmada: juan garcia — 2026-05-28 18:00-19:00',NULL,2,NULL,'2026-05-28 14:50:59','2026-05-28 14:50:59','2026-05-28 14:50:59'),(19,1,'reserva','Solicitud web (pendiente): juan garcia — 2026-05-28 20:00→21:00 (60min)',NULL,7,25000.00,'2026-05-28 15:47:20','2026-05-28 15:47:20','2026-05-28 15:47:20'),(20,1,'cancelacion','Reserva rechazada: juan garcia — 2026-05-28 20:00',NULL,2,NULL,'2026-05-28 15:48:40','2026-05-28 15:48:40','2026-05-28 15:48:40');
/*!40000 ALTER TABLE `operations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscriptions`
--

DROP TABLE IF EXISTS `subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complex_id` int NOT NULL,
  `precio_mensual` decimal(10,2) NOT NULL DEFAULT '0.00',
  `estado` enum('activo','inactivo') DEFAULT 'activo',
  `fecha_inicio` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `notas` text,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `complex_id` (`complex_id`),
  CONSTRAINT `subscriptions_ibfk_1` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscriptions`
--

LOCK TABLES `subscriptions` WRITE;
/*!40000 ALTER TABLE `subscriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `terminos`
--

DROP TABLE IF EXISTS `terminos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `terminos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version` varchar(20) NOT NULL,
  `contenido` longtext NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `terminos`
--

LOCK TABLES `terminos` WRITE;
/*!40000 ALTER TABLE `terminos` DISABLE KEYS */;
/*!40000 ALTER TABLE `terminos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `terms_aceptacion`
--

DROP TABLE IF EXISTS `terms_aceptacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `terms_aceptacion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `version` varchar(20) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `terms_aceptacion_usuario_id_version` (`usuario_id`,`version`),
  CONSTRAINT `terms_aceptacion_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `terms_aceptacion`
--

LOCK TABLES `terms_aceptacion` WRITE;
/*!40000 ALTER TABLE `terms_aceptacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `terms_aceptacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `time_slots`
--

DROP TABLE IF EXISTS `time_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `time_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field_id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora` varchar(5) NOT NULL,
  `estado` enum('libre','ocupado') DEFAULT 'libre',
  `booking_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `time_slots_field_id_fecha_hora` (`field_id`,`fecha`,`hora`),
  KEY `booking_id` (`booking_id`),
  CONSTRAINT `time_slots_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `time_slots_ibfk_2` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `time_slots`
--

LOCK TABLES `time_slots` WRITE;
/*!40000 ALTER TABLE `time_slots` DISABLE KEYS */;
INSERT INTO `time_slots` VALUES (1,1,'2026-05-08','14:00','ocupado',1,'2026-05-08 16:52:54','2026-05-08 16:52:54'),(2,1,'2026-05-08','14:30','ocupado',1,'2026-05-08 16:52:54','2026-05-08 16:52:54'),(3,1,'2026-05-08','15:00','libre',NULL,'2026-05-08 16:53:34','2026-05-08 16:58:41'),(4,1,'2026-05-08','15:30','libre',NULL,'2026-05-08 16:53:34','2026-05-08 16:58:41'),(5,1,'2026-05-08','16:00','libre',NULL,'2026-05-08 16:53:34','2026-05-08 16:58:41'),(6,2,'2026-05-08','16:30','ocupado',3,'2026-05-08 18:00:57','2026-05-08 18:00:57'),(7,2,'2026-05-08','17:00','ocupado',3,'2026-05-08 18:00:57','2026-05-08 18:00:57'),(8,2,'2026-05-08','19:30','ocupado',4,'2026-05-08 21:14:25','2026-05-08 21:14:25'),(9,2,'2026-05-08','20:00','ocupado',4,'2026-05-08 21:14:25','2026-05-08 21:14:25'),(10,2,'2026-05-08','20:30','ocupado',4,'2026-05-08 21:14:25','2026-05-08 21:14:25'),(11,2,'2026-05-08','21:00','ocupado',4,'2026-05-08 21:14:25','2026-05-08 21:14:25'),(12,1,'2026-05-08','20:30','ocupado',5,'2026-05-08 21:29:32','2026-05-08 21:29:32'),(13,1,'2026-05-08','21:00','ocupado',5,'2026-05-08 21:29:32','2026-05-08 21:29:32'),(14,1,'2026-05-28','19:00','libre',NULL,'2026-05-28 14:16:53','2026-05-28 14:36:51'),(15,1,'2026-05-28','19:30','libre',NULL,'2026-05-28 14:16:53','2026-05-28 14:36:51'),(16,2,'2026-05-28','19:00','libre',NULL,'2026-05-28 14:19:53','2026-05-28 14:37:00'),(17,2,'2026-05-28','19:30','libre',NULL,'2026-05-28 14:19:53','2026-05-28 14:37:00'),(18,1,'2026-05-28','12:30','libre',NULL,'2026-05-28 14:33:17','2026-05-28 14:36:44'),(19,1,'2026-05-28','13:00','libre',NULL,'2026-05-28 14:33:17','2026-05-28 14:36:44'),(20,1,'2026-06-01','15:00','libre',NULL,'2026-05-28 14:39:38','2026-05-28 14:41:36'),(21,1,'2026-06-15','17:00','libre',NULL,'2026-05-28 14:42:29','2026-05-28 14:42:29'),(22,2,'2026-05-28','18:00','ocupado',11,'2026-05-28 14:50:14','2026-05-28 14:50:14'),(23,2,'2026-05-28','18:30','ocupado',11,'2026-05-28 14:50:14','2026-05-28 14:50:14'),(24,1,'2026-05-28','20:00','libre',NULL,'2026-05-28 15:47:20','2026-05-28 15:48:40'),(25,1,'2026-05-28','20:30','libre',NULL,'2026-05-28 15:47:20','2026-05-28 15:48:40');
/*!40000 ALTER TABLE `time_slots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokens`
--

DROP TABLE IF EXISTS `tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `tipo` enum('reset_password','email_verificacion','otp_phone') NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado` tinyint(1) DEFAULT '0',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `tokens_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokens`
--

LOCK TABLES `tokens` WRITE;
/*!40000 ALTER TABLE `tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `apellido` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `rol` enum('general_admin','complex_admin','collaborator','player') DEFAULT 'player',
  `activo` tinyint(1) DEFAULT '1',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `email_2` (`email`),
  UNIQUE KEY `email_3` (`email`),
  UNIQUE KEY `email_4` (`email`),
  UNIQUE KEY `email_5` (`email`),
  UNIQUE KEY `email_6` (`email`),
  UNIQUE KEY `email_7` (`email`),
  UNIQUE KEY `email_8` (`email`),
  UNIQUE KEY `email_9` (`email`),
  UNIQUE KEY `email_10` (`email`),
  UNIQUE KEY `email_11` (`email`),
  UNIQUE KEY `email_12` (`email`),
  UNIQUE KEY `email_13` (`email`),
  UNIQUE KEY `email_14` (`email`),
  UNIQUE KEY `email_15` (`email`),
  UNIQUE KEY `email_16` (`email`),
  UNIQUE KEY `email_17` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Mauro','Largo','Largomauroandres@hotmail.com','$2a$10$/UQ5YtLmqZiC4twHHt3EDeogwRtjNZ7pkunQSxF61lEkXhqjJJTKS','+543815900938','complex_admin',1,'2026-04-29 14:28:26','2026-04-29 14:30:30'),(2,'Mauro','Largo','largomauroandres@gmail.com','$2a$10$NZ3xLJWAY/kNqsPANeG7ieDsU1RjZXOw8j6id3c.c2OuoDw2z402C','+543815900938','general_admin',1,'2026-04-29 14:34:43','2026-05-08 17:09:57'),(3,'David','Pedrini','david@prueba.com','$2a$10$5mmMWMrZwHHXCsFMT23.9uiua1q6yI15aPS55e6TE0qBTV4lPtoDC',NULL,'collaborator',1,'2026-04-29 14:41:38','2026-04-29 14:41:38'),(4,'susana','sueldo','susi@prueba.com','$2a$10$zHPC.DZDGeKwhK0/grv/Be7JUTQ2w5K0hMHjeO35hb/qIuCjplnYe','38154121212','player',1,'2026-05-08 17:17:29','2026-05-28 15:49:08'),(5,'Facundo','Largo','facu@prueba.com','$2a$10$A1jWacaVoFKI74flnR5Mxu8Q4tIEKhi86a.HTkCKIEEJFEzCWGpxm',NULL,'collaborator',1,'2026-05-08 22:03:21','2026-05-08 22:12:03'),(6,'Jose ','Perez','joseperez@prueba.com','$2a$10$70U380.m8ya1n2uVkrrB5.rIDNiHkhG/TnQEubj3WGxBAR5VzfJO2','381454545','complex_admin',1,'2026-05-28 14:01:56','2026-05-28 14:01:56'),(7,'juan','garcia','juan@prueba.com','$2a$10$oY2XxHpgsQqgTRXGVjhRjeEHMVYc0b9tErjGWPtaLCHlVFu.V0Hg2','3815900096','player',1,'2026-05-28 14:15:50','2026-05-28 14:15:50');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-19  9:47:02
