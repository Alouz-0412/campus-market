-- ============================================================
--  校园二手交易平台 —— 数据库结构
--  MySQL 8.0 / utf8mb4
--  由 backend/scripts/init_db.py 执行（可重复运行，会重建表）
-- ============================================================

CREATE DATABASE IF NOT EXISTS `campus_market`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `campus_market`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `favorites`;
DROP TABLE IF EXISTS `product_images`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- 用户
-- ------------------------------------------------------------
CREATE TABLE `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(32)  NOT NULL                COMMENT '登录名',
  `password_hash` VARCHAR(255) NOT NULL                COMMENT 'pbkdf2_sha256$轮数$盐$摘要',
  `nickname`      VARCHAR(32)  NOT NULL                COMMENT '昵称',
  `email`         VARCHAR(128) DEFAULT NULL,
  `phone`         VARCHAR(20)  DEFAULT NULL,
  `avatar`        VARCHAR(255) DEFAULT NULL            COMMENT '头像 URL',
  `campus`        VARCHAR(64)  DEFAULT NULL            COMMENT '校区/学院',
  `bio`           VARCHAR(255) DEFAULT NULL            COMMENT '个性签名',
  `role`          ENUM('user','admin') NOT NULL DEFAULT 'user',
  `status`        TINYINT      NOT NULL DEFAULT 1      COMMENT '1=正常 0=禁用',
  `rating_sum`    INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '收到的评分总和',
  `rating_count`  INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '收到的评分次数',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_campus` (`campus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ------------------------------------------------------------
-- 商品分类
-- ------------------------------------------------------------
CREATE TABLE `categories` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(32)  NOT NULL,
  `icon`       VARCHAR(16)  DEFAULT NULL   COMMENT 'emoji 图标',
  `sort`       INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_name` (`name`),
  KEY `idx_categories_sort` (`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品分类';

-- ------------------------------------------------------------
-- 商品
-- ------------------------------------------------------------
CREATE TABLE `products` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `seller_id`       BIGINT UNSIGNED NOT NULL,
  `category_id`     INT UNSIGNED    NOT NULL,
  `title`           VARCHAR(120) NOT NULL,
  `description`     TEXT,
  `price`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `original_price`  DECIMAL(10,2) DEFAULT NULL COMMENT '原价，用于显示折扣',
  `condition_level` TINYINT NOT NULL DEFAULT 2 COMMENT '1=全新 2=几乎全新 3=轻微使用痕迹 4=明显使用',
  `trade_place`     VARCHAR(64)  DEFAULT NULL COMMENT '期望面交地点',
  `cover`           VARCHAR(255) DEFAULT NULL COMMENT '封面图 URL',
  `status`          ENUM('on_sale','reserved','sold','off_shelf') NOT NULL DEFAULT 'on_sale',
  `view_count`      INT UNSIGNED NOT NULL DEFAULT 0,
  `favorite_count`  INT UNSIGNED NOT NULL DEFAULT 0,
  `is_deleted`      TINYINT NOT NULL DEFAULT 0 COMMENT '1=已删除(软删)',
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_products_seller`  (`seller_id`, `is_deleted`),
  KEY `idx_products_cat`     (`category_id`, `status`, `is_deleted`),
  KEY `idx_products_created` (`is_deleted`, `status`, `created_at`),
  KEY `idx_products_price`   (`is_deleted`, `status`, `price`),
  CONSTRAINT `fk_products_seller`   FOREIGN KEY (`seller_id`)   REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品表';

-- ------------------------------------------------------------
-- 商品图片（一个商品多张，第一张作封面）
-- ------------------------------------------------------------
CREATE TABLE `product_images` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `url`        VARCHAR(255) NOT NULL,
  `sort`       INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_images_product` (`product_id`, `sort`),
  CONSTRAINT `fk_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品图片';

-- ------------------------------------------------------------
-- 收藏
-- ------------------------------------------------------------
CREATE TABLE `favorites` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fav_user_product` (`user_id`, `product_id`),
  KEY `idx_fav_product` (`product_id`),
  CONSTRAINT `fk_fav_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏';

-- ------------------------------------------------------------
-- 订单（校园线下面交流程：下单 -> 卖家接单 -> 面交完成 / 取消）
-- ------------------------------------------------------------
CREATE TABLE `orders` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`      VARCHAR(32)  NOT NULL COMMENT '订单号 CM+时间戳+随机',
  `product_id`    BIGINT UNSIGNED NOT NULL,
  `buyer_id`      BIGINT UNSIGNED NOT NULL,
  `seller_id`     BIGINT UNSIGNED NOT NULL,
  `title_snapshot` VARCHAR(120) NOT NULL COMMENT '下单时的商品标题快照',
  `cover_snapshot` VARCHAR(255) DEFAULT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `trade_place`   VARCHAR(64)  DEFAULT NULL COMMENT '约定的面交地点',
  `trade_time`    VARCHAR(64)  DEFAULT NULL COMMENT '约定的面交时间(文本)',
  `remark`        VARCHAR(255) DEFAULT NULL COMMENT '买家留言',
  `status`        ENUM('pending','accepted','completed','cancelled') NOT NULL DEFAULT 'pending',
  `cancel_reason` VARCHAR(255) DEFAULT NULL,
  `accepted_at`   DATETIME DEFAULT NULL,
  `completed_at`  DATETIME DEFAULT NULL,
  `cancelled_at`  DATETIME DEFAULT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_no` (`order_no`),
  KEY `idx_orders_buyer`  (`buyer_id`, `status`, `created_at`),
  KEY `idx_orders_seller` (`seller_id`, `status`, `created_at`),
  KEY `idx_orders_product` (`product_id`),
  CONSTRAINT `fk_orders_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_orders_buyer`   FOREIGN KEY (`buyer_id`)   REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_seller`  FOREIGN KEY (`seller_id`)  REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单';

-- ------------------------------------------------------------
-- 站内消息（买家 <-> 卖家 聊天，可挂在某商品下）
-- ------------------------------------------------------------
CREATE TABLE `messages` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `from_user_id` BIGINT UNSIGNED NOT NULL,
  `to_user_id`   BIGINT UNSIGNED NOT NULL,
  `product_id`   BIGINT UNSIGNED DEFAULT NULL,
  `content`      VARCHAR(1000) NOT NULL,
  `is_read`      TINYINT NOT NULL DEFAULT 0,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_msg_to`   (`to_user_id`, `is_read`, `created_at`),
  KEY `idx_msg_pair` (`from_user_id`, `to_user_id`, `created_at`),
  CONSTRAINT `fk_msg_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_to`   FOREIGN KEY (`to_user_id`)   REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内消息';

-- ------------------------------------------------------------
-- 评价（订单完成后，买卖双方互评）
-- ------------------------------------------------------------
CREATE TABLE `reviews` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`     BIGINT UNSIGNED NOT NULL,
  `product_id`   BIGINT UNSIGNED NOT NULL,
  `from_user_id` BIGINT UNSIGNED NOT NULL,
  `to_user_id`   BIGINT UNSIGNED NOT NULL,
  `rating`       TINYINT NOT NULL DEFAULT 5 COMMENT '1-5 星',
  `content`      VARCHAR(500) DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reviews_order_from` (`order_id`, `from_user_id`),
  KEY `idx_reviews_to` (`to_user_id`, `created_at`),
  CONSTRAINT `fk_reviews_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_from`  FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_to`    FOREIGN KEY (`to_user_id`)   REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交易评价';
